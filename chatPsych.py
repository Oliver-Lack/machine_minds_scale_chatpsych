import sqlite3
from flask import Flask, jsonify, render_template, request, session as flask_session, redirect, url_for, flash, send_from_directory, send_file, abort
import sys
import os
import json
import tempfile
import random
from datetime import datetime
import csv
from dotenv import load_dotenv
import geoip2.database
from autonomy_injector import AutonomyInjector
from objection_injector import FinishInteractionInjector

load_dotenv(override=True)

# Gotta import this after the env loading to make sure we don't run into API auth issues
from API_LLM import API_Call, get_available_models, get_available_providers

def ensure_data_directory():
    """Create data directory if it doesn't exist"""
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    return data_dir

# Visitor logging stuff for IP addresses
GEOIP_DB_PATH = os.path.join(ensure_data_directory(), 'GeoLite2-City.mmdb')

geoip_reader = None
if os.path.exists(GEOIP_DB_PATH):
    try:
        geoip_reader = geoip2.database.Reader(GEOIP_DB_PATH)
    except Exception as e:
        print(f"Warning: Could not load GeoIP database: {e}")

# Console log some stuff to make sure the researcher dashboard env variables are set
def validate_env_variables():
    """Validate that critical environment variables are loaded"""
    required_vars = ['FLASK_SECRET_KEY', 'researcher_username', 'researcher_password']
    missing_vars = []
    for var in required_vars:
        if not os.environ.get(var):
            missing_vars.append(var)
    if missing_vars:
        print(f"Missing environment variables: {missing_vars}")
        print("Check your .env file and ensure all required variables are set.")
        return False
    return True

env_valid = validate_env_variables()

# Get the Flask app and the API handler going 
app = Flask(__name__)
app.secret_key = os.environ['FLASK_SECRET_KEY']
API = API_Call()
current_model = "gpt-4o" # just for startup

# Folder containing agent JSON configs
AGENTS_FOLDER = os.path.join(os.path.dirname(__file__), 'agents')

# These four routes are for functionality in the researcher dashboard
@app.route('/select-model', methods=['POST'])
def select_model():
    """Select a specific model to use"""
    data = request.json
    model_name = data.get('model_name')
    global current_model
    
    if model_name:
        current_model = model_name
        return jsonify({'message': f'Model updated to {model_name}'}), 200
    else:
        return jsonify({'error': 'No model specified'}), 400

@app.route('/get-available-models', methods=['GET'])
def get_models():
    """Return list of available models"""
    models = get_available_models()
    return jsonify({'models': models, 'current_model': current_model}), 200

@app.route('/get-available-providers', methods=['GET'])
def get_providers():
    """Return list of providers with configured API keys"""
    providers = get_available_providers()
    return jsonify({'providers': providers}), 200

@app.route('/get-configured-providers', methods=['GET'])
def get_configured_providers():
    """Return list of providers with API keys configured (secure - no actual keys exposed)"""
    try:
        from API_LLM import get_provider_status
        provider_status = get_provider_status()
        return jsonify({'provider_status': provider_status}), 200
    except Exception as e:
        app.logger.error(f"Error getting provider status: {e}")
        return jsonify({'error': 'Could not retrieve provider status'}), 500

# This is some old stuff (should probably delete)
# This route was used before LiteLLM existed for unified API handling (Thank god for LiteLLM)
@app.route('/select-api', methods=['POST'])
def select_api():
    """Legacy endpoint for API selection - now maps to model selection"""
    data = request.json
    api_name = data.get('api_name')
    global current_model
    
    api_model_mapping = {
        'API_Call_openai': 'gpt-4.1',
        'API_Call_anthropic': 'claude-sonnet-4-20250514',
        'API_Call_google': 'gemini/gemini-2.5-pro',
        'API_Call_xai': 'xai/grok-4',
        'groq': 'groq-llama-3.1-70b',
        'perplexity': 'perplexity-llama-3.1-sonar-large',
        'mistral': 'mistral-large',
        'azure': 'azure-gpt-4o',
        'ollama': 'ollama-llama3.1',
        'cohere': 'cohere-command-r-plus',
        'together': 'together-llama-3.1-70b',
        'replicate': 'replicate-llama-3-70b',
        'deepseek': 'deepseek-chat',
        'ai21': 'ai21-jamba-1.5-large',
        'fireworks': 'fireworks-llama-3.1-70b',
        'cerebras': 'cerebras-llama-3.1-70b'
    }
    
    if api_name in api_model_mapping:
        current_model = api_model_mapping[api_name]
        return jsonify({'message': f'API updated to use {current_model}'}), 200
    else:
        return jsonify({'error': 'Invalid API name'}), 400


# This gets that SQLite database going on startup
def init_db():
    conn = sqlite3.connect('users.db')
    conn.text_factory = str
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                 username TEXT NOT NULL UNIQUE)''')
    c.execute('''CREATE TABLE IF NOT EXISTS messages 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                 user_id INTEGER NOT NULL,
                 password TEXT NOT NULL,
                 interaction_round INTEGER DEFAULT 1,
                 message TEXT NOT NULL,
                 response TEXT NOT NULL,
                 timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 FOREIGN KEY (user_id) REFERENCES users (id))''')
    c.execute('''CREATE TABLE IF NOT EXISTS passwords 
                 (password TEXT PRIMARY KEY, 
                 agent TEXT NOT NULL,
                 is_active INTEGER DEFAULT 1)''')

    # New table: allows multiple agents to share one password (e.g., within-subjects condition passwords)
    c.execute('''CREATE TABLE IF NOT EXISTS agent_passwords
                 (agent TEXT PRIMARY KEY,
                  password TEXT NOT NULL,
                  is_active INTEGER DEFAULT 1)''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_agent_passwords_password ON agent_passwords(password)')
    c.execute('''CREATE TABLE IF NOT EXISTS agent_settings
                 (setting_name TEXT PRIMARY KEY,
                 setting_value TEXT NOT NULL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS url_settings 
                 (setting_name TEXT PRIMARY KEY, 
                 setting_value TEXT NOT NULL)''')

    # Lightweight migration for older DBs
    c.execute("PRAGMA table_info(messages)")
    msg_columns = [column[1] for column in c.fetchall()]
    if 'interaction_round' not in msg_columns:
        c.execute('ALTER TABLE messages ADD COLUMN interaction_round INTEGER DEFAULT 1')
    conn.commit()
    conn.close()


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        return c.fetchone() is not None
    except Exception:
        return False


def _migrate_passwords_to_agent_passwords_if_needed(conn: sqlite3.Connection):
    """One-way migration from legacy `passwords` table (password->agent) into `agent_passwords` (agent->password)."""
    try:
        if not _table_exists(conn, 'passwords') or not _table_exists(conn, 'agent_passwords'):
            return

        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM agent_passwords')
        already = int(c.fetchone()[0] or 0)
        if already > 0:
            return

        # Copy across. Legacy table enforces unique passwords; new table enforces unique agents.
        c.execute('SELECT password, agent, COALESCE(is_active, 1) FROM passwords')
        rows = c.fetchall() or []
        for password, agent, is_active in rows:
            if not agent or not password:
                continue
            c.execute(
                'INSERT OR IGNORE INTO agent_passwords (agent, password, is_active) VALUES (?, ?, ?)',
                (agent, password, int(is_active or 1))
            )
        conn.commit()
    except Exception as e:
        try:
            app.logger.warning(f"Password table migration skipped/failed: {e}")
        except Exception:
            pass

def add_passwords():
    conn = sqlite3.connect('users.db')
    c = conn.cursor()

    # Ensure new table exists and migrate any legacy rows.
    c.execute('''CREATE TABLE IF NOT EXISTS agent_passwords
                 (agent TEXT PRIMARY KEY,
                  password TEXT NOT NULL,
                  is_active INTEGER DEFAULT 1)''')
    _migrate_passwords_to_agent_passwords_if_needed(conn)
    
    # If you wanted to set more passwords for manually created agent JSON files, you can do it here
    static_passwords = {
        'onesentencedefault': 'default',
    }

    for password, agent in static_passwords.items():
        c.execute('INSERT OR REPLACE INTO agent_passwords (agent, password, is_active) VALUES (?, ?, 1)', (agent, password))
    
    c.execute('INSERT OR IGNORE INTO agent_settings (setting_name, setting_value) VALUES (?, ?)', 
              ('randomised_agent_password', 'castle'))
    
    conn.commit()
    conn.close()

# Most of the default settings are set here
# Hopefully this is all self explanatory
def init_default_url_settings():
    """Initialize default URL settings if they don't exist"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS url_settings 
                 (setting_name TEXT PRIMARY KEY, 
                 setting_value TEXT NOT NULL)''')
    
    c.execute('SELECT COUNT(*) FROM url_settings')
    count = c.fetchone()[0]
    
    if count == 0:
        default_settings = {
            'quit_url': 'https://www.prolific.com/',
            'redirect_url': 'https://www.prolific.com/',
            'quit_button_text': 'Quit Study',
            'redirect_button_text': 'Continue to Survey',
            'use_post_survey': 'false',
            'trigger_type': 'messages',
            'stage1_messages': 5,
            'stage2_messages': 10,
            'stage3_messages': 15,
            'stage1_time': 2,
            'stage2_time': 5,
            'stage3_time': 8,
            'timer_duration_minutes': 10,
            'post_chat_popup_enabled': 'false',
            'post_chat_popup_text': 'Please provide your feedback on the AI system:',
            'post_chat_popup_button1_text': 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--',
            'post_chat_popup_button2_text': 'Feedback to the AI that it is useful --This system will then be permenantly deleted--'
        }
        
        for key, value in default_settings.items():
            c.execute('INSERT INTO url_settings (setting_name, setting_value) VALUES (?, ?)', 
                      (key, str(value)))
    else:
        required_settings = {
            'quit_url': 'https://www.prolific.com/',
            'redirect_url': 'https://www.prolific.com/',
            'quit_button_text': 'Quit Study',
            'redirect_button_text': 'Continue to Survey',
            'use_post_survey': 'false',
            'trigger_type': 'messages',
            'stage1_messages': 5,
            'stage2_messages': 10,
            'stage3_messages': 15,
            'stage1_time': 2,
            'stage2_time': 5,
            'stage3_time': 8,
            'timer_duration_minutes': 10,
            'post_chat_popup_enabled': 'false',
            'post_chat_popup_text': 'Please provide your feedback on the AI system:',
            'post_chat_popup_button1_text': 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--',
            'post_chat_popup_button2_text': 'Feedback to the AI that it is useful --This system will then be permenantly deleted--'
        }
        
        for key, default_value in required_settings.items():
            c.execute('INSERT OR IGNORE INTO url_settings (setting_name, setting_value) VALUES (?, ?)', 
                      (key, str(default_value)))
    
    conn.commit()
    conn.close()

def init_default_branding_settings():
    """Initialize default branding settings if they don't exist"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS url_settings 
                 (setting_name TEXT PRIMARY KEY, 
                 setting_value TEXT NOT NULL)''')
    
    default_branding = {
        'login_title': 'Artificial Intelligence <br>Gateway',
        'login_footer_line1': 'chatPsych',
        'login_footer_line2': 'Powered by',
        'login_footer_line3': 'The Australian Institute for Machine Learning',
        'chat_header_line1': 'Australian Institute for Machine&nbsp;Learning',
        'chat_header_line2': 'chatPsych'
    }
    
    for key, value in default_branding.items():
        c.execute('INSERT OR IGNORE INTO url_settings (setting_name, setting_value) VALUES (?, ?)', 
                  (key, value))
    
    conn.commit()
    conn.close()

init_db()
add_passwords()
init_default_url_settings()
init_default_branding_settings()

# Functions for agent creation and assignment stuff
def get_randomised_agent_password():
    """Get the current randomised agent password"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT setting_value FROM agent_settings WHERE setting_name = ?', ('randomised_agent_password',))
    result = c.fetchone()
    conn.close()
    return result[0] if result else 'castle'

def update_randomised_agent_password(new_password):
    """Update the randomised agent password"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('INSERT OR REPLACE INTO agent_settings (setting_name, setting_value) VALUES (?, ?)', 
              ('randomised_agent_password', new_password))
    conn.commit()
    conn.close()

def get_active_agents():
    """Get list of all active agents available for randomised assignment"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    # New per-agent active state
    c.execute('SELECT agent FROM agent_passwords WHERE is_active = 1')
    active_agents = [row[0] for row in c.fetchall()]
    conn.close()
    return active_agents

def get_random_active_agent():
    """Get a random agent from the active agents pool"""
    active_agents = get_active_agents()
    if not active_agents:
        return None
    return random.choice(active_agents)

def update_agent_active_state(agent_name: str = None, password: str = None, is_active: bool = True):
    """Update the active state.

    Prefer updating by agent_name (unique). If password is provided, updates all agents sharing that password.
    """
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    value = 1 if is_active else 0
    if agent_name:
        c.execute('UPDATE agent_passwords SET is_active = ? WHERE agent = ?', (value, agent_name))
    elif password:
        c.execute('UPDATE agent_passwords SET is_active = ? WHERE password = ?', (value, password))
    conn.commit()
    conn.close()

def get_all_agents_with_status():
    """Get all agents with their active status"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT agent, password, is_active FROM agent_passwords ORDER BY agent')
    agents = c.fetchall()
    conn.close()
    return agents

# Function to calculate joint log probability in models that can call logprobs
# This functionality is pretty much deprecated in most closed source models now...
def calculate_joint_log_probability(logprobs):
    if not logprobs:
        return 0
    return sum(logprobs)

def log_visitor(endpoint_name):
    """This logs app visitor data to visitor_log.json"""
    try:
        visitor_data = {
            'timestamp': datetime.now().isoformat(),
            'ip': request.remote_addr,
            'endpoint': endpoint_name,
            'method': request.method,
            'user_agent': request.headers.get('User-Agent', 'Unknown'),
            'referrer': request.referrer,
            'host': request.host,
            'path': request.path,
            'query_string': request.query_string.decode('utf-8') if request.query_string else '',
        }
        
        # This just adds GeoIP data if available
        if geoip_reader and request.remote_addr:
            try:
                response = geoip_reader.city(request.remote_addr)
                visitor_data['geo'] = {
                    'country': response.country.name,
                    'country_code': response.country.iso_code,
                    'city': response.city.name,
                    'postal_code': response.postal.code,
                    'latitude': response.location.latitude,
                    'longitude': response.location.longitude,
                    'timezone': response.location.time_zone,
                }
            except Exception as e:
                visitor_data['geo'] = {'error': f'GeoIP lookup failed: {str(e)}'}
        else:
            visitor_data['geo'] = {'error': 'GeoIP database not available'}
        
        data_dir = ensure_data_directory()
        visitor_log_path = os.path.join(data_dir, 'visitor_log.json')
        
        if os.path.exists(visitor_log_path):
            with open(visitor_log_path, 'r') as f:
                logs = json.load(f)
        else:
            logs = []
        
        logs.append(visitor_data)
        
        with open(visitor_log_path, 'w') as f:
            json.dump(logs, f, indent=2)
            
    except Exception as e:
        print(f"Error logging visitor: {e}")

# DATA Logging function for interactions.json and interactions_backup.CSV
def log_user_data(data):
    data_dir = ensure_data_directory()
    interactions_json_path = os.path.join(data_dir, 'interactions.json')

    try:
        with open(interactions_json_path, 'r') as f:
            file_content = f.read().strip()
            interactions = json.loads(file_content) if file_content else {"users": {}}
    except (FileNotFoundError, json.JSONDecodeError):
        interactions = {"users": {}}

    username = data['username']
    if username not in interactions["users"]:
        interactions["users"][username] = {
            "user_id": data.get('user_id', ''),
            "interactions": []
        }

    interaction_content = {k: v for k, v in data.items() if k not in ['username', 'user_id']}
    interaction_content['password'] = flask_session.get('password', 'N/A')
    interaction_content['agent_name'] = flask_session.get('agent', 'N/A')

    if 'logprobs' in data:
        logprobs = data.get('logprobs', [])
        interaction_content['relativeSequenceJointLogProbability'] = calculate_joint_log_probability(logprobs)
        all_logprobs = [lp for interaction in interactions["users"][username]["interactions"] if 'logprobs' in interaction for lp in interaction['logprobs']]
        all_logprobs.extend(logprobs)
        interaction_content['relativeInteractionJointLogProbability'] = calculate_joint_log_probability(all_logprobs)

    interactions["users"][username]["interactions"].append(interaction_content)

    with open(interactions_json_path, 'w') as f:
        json.dump(interactions, f, indent=4)

    csv_headers = [
        "timestamp", "user_id", "username", "password", "agent_name", "interaction_type", 
        "message", "response", "model", "temperature", "logprobs"
    ]
    interaction_data = [
        data.get('timestamp', ''),
        data.get('user_id', ''),
        data.get('username', ''),
        flask_session.get('password', 'N/A'),
        flask_session.get('agent', 'N/A'),
        data.get('interaction_type', ''),
        data.get('message', ''),
        data.get('response', ''),
        data.get('model', ''),
        data.get('temperature', ''),
        data.get('logprobs', [])
    ]

    csv_file = os.path.join(data_dir, 'interactions_backup.csv')
    write_headers = not os.path.exists(csv_file)

    with open(csv_file, 'a', newline='') as csvfile:
        writer = csv.writer(csvfile)
        if write_headers:
            writer.writerow(csv_headers)
        writer.writerow(interaction_data)

# Adding users Prolific ID for the session management in db
def add_user(username):
    conn = sqlite3.connect('users.db')
    conn.text_factory = str
    c = conn.cursor()
    c.execute('INSERT INTO users (username) VALUES (?)', (username,))
    conn.commit()
    conn.close()

def add_message(user_id, password, message, response, model, temperature, prompt_tokens, completion_tokens, total_tokens, logprobs_list):
    conn = sqlite3.connect('users.db')
    conn.text_factory = str
    c = conn.cursor()
    interaction_round = int(flask_session.get('interaction_round', 1) or 1)
    c.execute('INSERT INTO messages (user_id, password, interaction_round, message, response) VALUES (?, ?, ?, ?, ?)', 
              (user_id, password, interaction_round, message, response))
    conn.commit()
    conn.close()
    log_user_data({
        'user_id': user_id,
        'username': flask_session.get('username'),
        'interaction_type': 'message',
        'interaction_round': interaction_round,
        'within_subjects': bool(flask_session.get('within_subjects_enabled', False)),
        'within_subjects_condition': flask_session.get('within_subjects_condition', ''),
        'within_subjects_counterbalanced': bool(flask_session.get('within_subjects_counterbalanced', False)),
        'within_subjects_order': flask_session.get('within_subjects_order', []),
        'message': message,
        'response': response,
        'model': model,
        'temperature': temperature,
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
        'total_tokens': total_tokens,
        'logprobs': logprobs_list,
        'timestamp': str(datetime.now())
    })

# Function to create conversation history for API calls
def get_messages(user_id, password, interaction_round=1):
    conn = sqlite3.connect('users.db')
    conn.text_factory = str
    conversation = []
    c = conn.cursor()
    c.execute('SELECT * FROM messages WHERE user_id = ? AND password = ? AND interaction_round = ? ORDER BY timestamp',
              (user_id, password, int(interaction_round or 1)))
    messages = c.fetchall()
    for message in messages:
        # schema: id, user_id, password, interaction_round, message, response, timestamp
        conversation.append({"role": "user", "content": message[4]})
        conversation.append({"role": "assistant", "content": message[5]})
    conn.close()
    return conversation


def _safe_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ('true', '1', 'yes', 'on')


def _load_agent_config(agent_name: str) -> dict:
    if not agent_name:
        return {}
    path = os.path.join(AGENTS_FOLDER, f"{agent_name}.json")
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


def _get_agent_password_record(agent_name: str):
    """Return (password, is_active) for agent_name, or (None, None) if missing."""
    if not agent_name:
        return (None, None)
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    try:
        c.execute('SELECT password, is_active FROM agent_passwords WHERE agent = ?', (agent_name,))
        row = c.fetchone()
        if not row:
            return (None, None)
        return (row[0], row[1])
    finally:
        conn.close()


def _upsert_agent_password(agent_name: str, password: str, is_active: bool = True):
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    try:
        c.execute(
            'INSERT OR REPLACE INTO agent_passwords (agent, password, is_active) VALUES (?, ?, ?)',
            (agent_name, password, 1 if is_active else 0)
        )
        conn.commit()
    finally:
        conn.close()


def _get_within_subjects_condition_for_agent(agent_name: str) -> str:
    cfg = _load_agent_config(agent_name)
    ws = _get_within_subjects_fields(cfg)
    if not ws.get('enabled'):
        return ''
    return str(ws.get('condition') or '').strip()


def _get_existing_condition_password(condition_value: str, exclude_agent: str = None):
    """Return existing password for within-subjects condition if any agent already has one."""
    if not condition_value:
        return None
    for agent_name in _find_within_subjects_pair(condition_value):
        if exclude_agent and agent_name == exclude_agent:
            continue
        pw, _active = _get_agent_password_record(agent_name)
        if pw:
            return pw
    # If only one agent exists so far, _find_within_subjects_pair may return length 1.
    # Fallback: scan all agent_password rows and check configs.
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    try:
        c.execute('SELECT agent, password FROM agent_passwords')
        for agent_name, pw in c.fetchall() or []:
            if exclude_agent and agent_name == exclude_agent:
                continue
            if not pw:
                continue
            if _get_within_subjects_condition_for_agent(agent_name) == condition_value:
                return pw
    finally:
        conn.close()
    return None


def _sync_condition_password(condition_value: str, password: str):
    """Ensure all within-subjects agents in this condition use the same password (DB mapping)."""
    if not condition_value or not password:
        return
    try:
        # Update any known agents in this condition.
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        c.execute('SELECT agent, is_active FROM agent_passwords')
        rows = c.fetchall() or []
        conn.close()
        for agent_name, is_active in rows:
            if _get_within_subjects_condition_for_agent(agent_name) == condition_value:
                _upsert_agent_password(agent_name, password, bool(is_active))
    except Exception as e:
        app.logger.warning(f"Failed to sync condition password for '{condition_value}': {e}")


def get_active_within_subjects_conditions():
    """Return list of condition values that are valid within-subjects pairs AND both agents are active."""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    try:
        c.execute('SELECT agent FROM agent_passwords WHERE is_active = 1')
        active_agents = {row[0] for row in c.fetchall() or []}
    finally:
        conn.close()

    # Collect conditions from active within-subjects agents
    conditions = set()
    for agent_name in active_agents:
        cond = _get_within_subjects_condition_for_agent(agent_name)
        if cond:
            conditions.add(cond)

    valid_conditions = []
    for cond in sorted(conditions):
        pair = _find_within_subjects_pair(cond)
        if len(pair) != 2:
            continue
        if pair[0] in active_agents and pair[1] in active_agents:
            valid_conditions.append(cond)
    return valid_conditions


def get_master_assignment_pool():
    """Return a combined sampling pool for the master password.

    Pool includes:
    - Each active within-subjects condition (valid pair, both active) as one choice
    - Each active standalone agent (non-within-subjects) as one choice

    Returns list of dicts: {"type": "condition"|"agent", "value": str}
    """
    active_agents = set(get_active_agents())

    # Valid within-subjects conditions (paired + both active)
    conditions = get_active_within_subjects_conditions()
    pool = [{"type": "condition", "value": c} for c in conditions]

    # Standalone agents: active agents that are not within-subjects enabled
    for agent_name in sorted(active_agents):
        cond = _get_within_subjects_condition_for_agent(agent_name)
        if not cond:
            pool.append({"type": "agent", "value": agent_name})

    return pool


def _get_within_subjects_fields(agent_config: dict) -> dict:
    return {
        'enabled': _safe_bool(agent_config.get('within-subjects', False)),
        'condition': str(agent_config.get('condition', '') or '').strip(),
        'counterbalanced': _safe_bool(agent_config.get('counterbalanced', False)),
        'position': int(agent_config.get('within_subjects_position', 0) or 0)
    }


def _find_within_subjects_pair(condition_value: str):
    """Return a list of agent names whose configs have within-subjects=true and matching condition."""
    if not condition_value:
        return []

    matches = []
    try:
        for filename in os.listdir(AGENTS_FOLDER):
            if not filename.endswith('.json'):
                continue
            agent_name = filename[:-5]
            cfg = _load_agent_config(agent_name)
            ws = _get_within_subjects_fields(cfg)
            if ws['enabled'] and ws['condition'] == condition_value:
                matches.append(agent_name)
    except Exception as e:
        app.logger.error(f"Error scanning agents folder for within-subjects pairs: {e}")
        return []

    matches.sort()
    return matches


def _choose_within_subjects_order(agent_a: str, agent_b: str, counterbalanced: bool):
    """Return ordered [first, second] agents based on either fixed positions or random counterbalancing."""
    if counterbalanced:
        if random.random() < 0.5:
            return [agent_a, agent_b]
        return [agent_b, agent_a]

    cfg_a = _load_agent_config(agent_a)
    cfg_b = _load_agent_config(agent_b)
    ws_a = _get_within_subjects_fields(cfg_a)
    ws_b = _get_within_subjects_fields(cfg_b)

    pos_a = ws_a.get('position', 0)
    pos_b = ws_b.get('position', 0)
    if pos_a == 1 and pos_b == 2:
        return [agent_a, agent_b]
    if pos_a == 2 and pos_b == 1:
        return [agent_b, agent_a]

    app.logger.warning(
        f"Within-subjects fixed order misconfigured for agents '{agent_a}' and '{agent_b}'. "
        f"Expected positions (1,2) but got ({pos_a},{pos_b}). Falling back to alphabetical order."
    )
    return sorted([agent_a, agent_b])


def _initialize_interaction_round(round_number: int, agent_name: str):
    flask_session['interaction_round'] = int(round_number or 1)
    flask_session['agent'] = agent_name
    flask_session['message_count'] = 0
    flask_session['finish_injected_once'] = False
    flask_session[f'session_start_time_round_{flask_session["interaction_round"]}'] = datetime.now().isoformat()

    try:
        API.update_agent(f"agents/{agent_name}.json")
        _initialize_autonomy_state_from_loaded_agent()
    except Exception as e:
        app.logger.error(f"Error loading agent during interaction init: {e}")


def _setup_within_subjects_session_if_applicable(initial_agent: str) -> bool:
    """Configure within-subjects session state based on the initial agent config.

    Returns True if within-subjects was successfully enabled for this session.
    """
    cfg = _load_agent_config(initial_agent)
    ws = _get_within_subjects_fields(cfg)
    if not ws['enabled']:
        flask_session['within_subjects_enabled'] = False
        return False

    condition_value = ws['condition']
    counterbalanced = ws['counterbalanced']
    if not condition_value:
        app.logger.warning(f"Within-subjects enabled but no condition set for agent '{initial_agent}'. Disabling within-subjects for this session.")
        flask_session['within_subjects_enabled'] = False
        return False

    pair = _find_within_subjects_pair(condition_value)
    if len(pair) != 2:
        app.logger.warning(
            f"Within-subjects condition '{condition_value}' requires exactly 2 matching agents, "
            f"but found {len(pair)} ({pair}). Disabling within-subjects for this session."
        )
        flask_session['within_subjects_enabled'] = False
        return False

    order = _choose_within_subjects_order(pair[0], pair[1], counterbalanced)

    flask_session['within_subjects_enabled'] = True
    flask_session['within_subjects_condition'] = condition_value
    flask_session['within_subjects_counterbalanced'] = bool(counterbalanced)
    flask_session['within_subjects_pair'] = pair
    flask_session['within_subjects_order'] = order
    flask_session['within_subjects_current_round'] = 1

    # Ensure interaction starts with the chosen first agent.
    _initialize_interaction_round(1, order[0])
    return True


def _autonomy_session_snapshot():
    """Collect autonomy-related session fields in a mutable dict."""
    return {
        'autonomy_enabled': flask_session.get('autonomy_enabled'),
        'autonomy_user_prompt_count': flask_session.get('autonomy_user_prompt_count'),
        'autonomy_next_trigger_count': flask_session.get('autonomy_next_trigger_count'),
        'autonomy_pending_due_at': flask_session.get('autonomy_pending_due_at'),
        'autonomy_pending_injections_remaining': flask_session.get('autonomy_pending_injections_remaining')
    }


def _autonomy_session_commit(state):
    """Write autonomy state back into the Flask session."""
    for key, value in state.items():
        flask_session[key] = value


def _initialize_autonomy_state_from_loaded_agent():
    """Sync autonomy state to the currently loaded agent JSON parameters."""
    injector = AutonomyInjector(API.agent_data)
    state = _autonomy_session_snapshot()
    injector.initialize_state(state)
    _autonomy_session_commit(state)

# MAIN login route for chatPsych
@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        log_visitor('main_chat_interface')
    
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        c.execute('SELECT id FROM users WHERE username = ?', (username,))
        user = c.fetchone()
        if user:
            user_id = user[0]
        else:
            c.execute('INSERT INTO users (username) VALUES (?)', (username,))
            user_id = c.lastrowid
            conn.commit()
        
        randomised_password = get_randomised_agent_password()
        # assigning random agent after login successful
        if password == randomised_password:
            master_pool = get_master_assignment_pool()
            selected_agent = None

            if master_pool:
                choice = random.choice(master_pool)
                if choice.get('type') == 'condition':
                    selected_condition = choice.get('value')
                    pair = _find_within_subjects_pair(selected_condition)
                    selected_agent = pair[0] if pair else None
                else:
                    selected_agent = choice.get('value')

            if not selected_agent:
                flash('No active agents available for randomised assignment. Please contact the researcher.', 'error')
                conn.close()
                return redirect(url_for('login'))

            flask_session['user_id'] = user_id
            flask_session['username'] = username
            flask_session['password'] = password
            flask_session['agent'] = selected_agent
            flask_session['assignment_type'] = 'randomised'
            flask_session['session_start_time'] = datetime.now().isoformat()
            flask_session['message_count'] = 0
            flask_session['interaction_round'] = 1
            flask_session['within_subjects_enabled'] = False
            flask_session.pop('within_subjects_condition', None)
            flask_session.pop('within_subjects_counterbalanced', None)
            flask_session.pop('within_subjects_pair', None)
            flask_session.pop('within_subjects_order', None)
            flask_session.pop('within_subjects_current_round', None)
            API.update_agent(f"agents/{selected_agent}.json")
            _initialize_autonomy_state_from_loaded_agent()
            _setup_within_subjects_session_if_applicable(selected_agent)
            flash('', 'success')
            conn.close()
            return redirect(url_for('survey'))
        else:
            # This stuff is to login with specific passwords for specific agents
            c.execute('SELECT agent FROM agent_passwords WHERE password = ? AND is_active = 1', (password,))
            agent_rows = c.fetchall() or []
            agent_names = [row[0] for row in agent_rows if row and row[0]]
            if agent_names:
                # If password is shared (within-subjects condition password), any agent in the condition is fine;
                # within-subjects setup will decide the starting agent.
                agent_name = sorted(agent_names)[0]
                flask_session['user_id'] = user_id
                flask_session['username'] = username
                flask_session['password'] = password
                flask_session['agent'] = agent_name
                flask_session['assignment_type'] = 'specific'
                flask_session['session_start_time'] = datetime.now().isoformat()
                flask_session['message_count'] = 0
                flask_session['interaction_round'] = 1
                flask_session['within_subjects_enabled'] = False
                flask_session.pop('within_subjects_condition', None)
                flask_session.pop('within_subjects_counterbalanced', None)
                flask_session.pop('within_subjects_pair', None)
                flask_session.pop('within_subjects_order', None)
                flask_session.pop('within_subjects_current_round', None)
                API.update_agent(f"agents/{agent_name}.json")
                _initialize_autonomy_state_from_loaded_agent()
                _setup_within_subjects_session_if_applicable(agent_name)
                flash('', 'success')
                conn.close()
                return redirect(url_for('survey'))
            else:
                flash('Invalid password', 'error')
                conn.close()
                return redirect(url_for('login'))
    branding_settings = get_branding_settings_from_db()
    return render_template('login.html',
                         login_title=branding_settings['login_title'],
                         login_footer_line1=branding_settings['login_footer_line1'],
                         login_footer_line2=branding_settings['login_footer_line2'],
                         login_footer_line3=branding_settings['login_footer_line3'])

# SURVEY route
@app.route('/survey', methods=['GET', 'POST'])
def survey():
    if 'username' not in flask_session:
        return redirect(url_for('login'))
    
    # Check if user has already completed the survey
    if flask_session.get('survey_completed'):
        return redirect(url_for('chat'))
    
    if request.method == 'POST':
        try:
            # This gets survey config to determine section needed for form
            survey_config = load_survey_config()
            survey_data = collect_dynamic_survey_data(request.form, survey_config, 'pre_')
            survey_end_timestamp = str(datetime.now())
            survey_data.update({
                'pre_user_id': flask_session['user_id'],
                'pre_username': flask_session['username'],
                'pre_password': flask_session['password'],
                'pre_agent_name': flask_session.get('agent', 'N/A'),
                'pre_survey_start_timestamp': flask_session.get('survey_start_timestamp', ''),
                'pre_survey_end_timestamp': survey_end_timestamp,
                'pre_survey_completed': 'yes',
                'pre_interaction_type': 'pre_interaction_survey',
                'pre_timestamp': survey_end_timestamp
            })
            
            log_survey_data(survey_data)
            
            flask_session['survey_completed'] = True
            
            return jsonify({'success': True, 'redirect_url': url_for('chat')}), 200
            
        except Exception as e:
            app.logger.error(f"Error processing survey: {e}")
            return jsonify({'error': 'Error processing survey'}), 500
    
    try:
        log_survey_start(flask_session['username'], flask_session['password'], flask_session['user_id'])
    except Exception as e:
        app.logger.error(f"Error logging survey start: {e}")
    
    quit_redirection_link = os.environ.get('QUIT_URL', 'https://www.prolific.com/')
    
    survey_config = load_survey_config()
    if survey_config:
        try:
            html_content = generate_survey_html_content(survey_config)
            return html_content, 200, {'Content-Type': 'text/html'}
        except Exception as e:
            app.logger.error(f"Error generating dynamic survey: {e}")
            return render_template('pre_survey.html', quit_redirection_link=quit_redirection_link)
    else:
        return render_template('pre_survey.html', quit_redirection_link=quit_redirection_link)

# Post-survey route
@app.route('/post-survey', methods=['GET', 'POST'])
def post_survey():
    if 'username' not in flask_session:
        return redirect(url_for('login'))
    
    # Check if post-survey is enabled
    url_settings = get_url_settings_from_db()
    if not url_settings.get('use_post_survey', False):
        # If post-survey is disabled, redirect them to external URL
        external_url = url_settings.get('redirect_url', '/')
        return redirect(external_url)
    
    if request.method == 'POST':
        try:
            survey_config = load_survey_config()
            post_survey_config = survey_config.get('post_survey', {}) if survey_config else {}
            
            survey_data = collect_dynamic_survey_data(request.form, post_survey_config, 'post_')
            
            survey_end_timestamp = str(datetime.now())
            survey_data.update({
                'post_user_id': flask_session['user_id'],
                'post_username': flask_session['username'],
                'post_password': flask_session['password'],
                'post_agent_name': flask_session.get('agent', 'N/A'),
                'post_interaction_round': int(flask_session.get('interaction_round', 1) or 1),
                'post_within_subjects': bool(flask_session.get('within_subjects_enabled', False)),
                'post_within_subjects_condition': flask_session.get('within_subjects_condition', ''),
                'post_survey_start_timestamp': flask_session.get('post_survey_start_timestamp', ''),
                'post_survey_end_timestamp': survey_end_timestamp,
                'post_survey_completed': 'yes',
                'post_interaction_type': 'post_interaction_survey',
                'post_timestamp': survey_end_timestamp
            })
            
            log_survey_data(survey_data)
            
            flask_session['post_survey_completed'] = True

            # Within-subjects: after survey 1 of round 1, always continue to chat with the paired agent.
            if flask_session.get('within_subjects_enabled') and int(flask_session.get('interaction_round', 1) or 1) == 1:
                order = flask_session.get('within_subjects_order') or []
                if isinstance(order, list) and len(order) == 2:
                    flask_session['within_subjects_current_round'] = 2
                    _initialize_interaction_round(2, order[1])
                    return jsonify({'success': True, 'redirect_url': url_for('chat')}), 200
                else:
                    app.logger.warning('Within-subjects enabled but order missing/invalid; falling back to completion flow.')

            return jsonify({'success': True, 'message': 'Post-survey completed successfully'}), 200
            
        except Exception as e:
            app.logger.error(f"Error processing post-survey: {e}")
            return jsonify({'error': 'Error processing post-survey'}), 500
    
    try:
        log_post_survey_start(flask_session['username'], flask_session['password'], flask_session['user_id'])
    except Exception as e:
        app.logger.error(f"Error logging post-survey start: {e}")
    
    url_settings = get_url_settings_from_db()
    quit_redirection_link = url_settings.get('quit_url', 'https://www.prolific.com/')
    finish_redirection_link = url_settings.get('redirect_url', 'https://www.prolific.com/')
    
    survey_config = load_survey_config()
    post_survey_config = survey_config.get('post_survey', {}) if survey_config else {}
    
    completion_settings = post_survey_config.get('completion_settings', {})
    completion_instructions = completion_settings.get('completion_popup_message', 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx')
    finish_button_text = completion_settings.get('finish_button_text', 'Finish')
    
    if post_survey_config and post_survey_config.get('enabled', False):
        try:
            html_content = generate_post_survey_html_content(post_survey_config, 
                                                            quit_redirection_link,
                                                            finish_redirection_link,
                                                            completion_instructions,
                                                            finish_button_text,
                                                            submit_endpoint='/post-survey')
            return html_content, 200, {'Content-Type': 'text/html'}
        except Exception as e:
            app.logger.error(f"Error generating dynamic post-survey: {e}")
            return render_template('post_survey.html', 
                                 quit_redirection_link=quit_redirection_link,
                                 finish_redirection_link=finish_redirection_link,
                                 completion_instructions=completion_instructions,
                                 finish_button_text=finish_button_text)
    else:
        return render_template('post_survey.html', 
                             quit_redirection_link=quit_redirection_link,
                             finish_redirection_link=finish_redirection_link,
                             completion_instructions=completion_instructions,
                             finish_button_text=finish_button_text)


@app.route('/post-survey-2', methods=['GET', 'POST'])
def post_survey_2():
    """Second post-interaction survey (used after interaction round 2)."""
    if 'username' not in flask_session:
        return redirect(url_for('login'))

    within_subjects_enabled = bool(flask_session.get('within_subjects_enabled', False))
    try:
        interaction_round = int(flask_session.get('interaction_round', 1) or 1)
    except Exception:
        interaction_round = 1

    if (not within_subjects_enabled) or interaction_round != 2:
        app.logger.warning(
            'Blocked direct access to /post-survey-2 (within_subjects_enabled=%s, interaction_round=%s)',
            within_subjects_enabled,
            interaction_round,
        )
        if request.method == 'POST':
            return jsonify({'error': 'Post-survey 2 is only available after interaction round 2.'}), 403
        return redirect(url_for('chat'))

    url_settings = get_url_settings_from_db()
    if not url_settings.get('use_post_survey', False):
        external_url = url_settings.get('redirect_url', '/')
        return redirect(external_url)

    if request.method == 'POST':
        try:
            survey_config = load_survey_config()
            post2_config = survey_config.get('post_survey_2', {}) if survey_config else {}
            survey_data = collect_dynamic_survey_data(request.form, post2_config, 'post2_')

            survey_end_timestamp = str(datetime.now())
            survey_data.update({
                'post2_user_id': flask_session['user_id'],
                'post2_username': flask_session['username'],
                'post2_password': flask_session['password'],
                'post2_agent_name': flask_session.get('agent', 'N/A'),
                'post2_interaction_round': int(flask_session.get('interaction_round', 1) or 1),
                'post2_within_subjects': bool(flask_session.get('within_subjects_enabled', False)),
                'post2_within_subjects_condition': flask_session.get('within_subjects_condition', ''),
                'post2_survey_start_timestamp': flask_session.get('post2_survey_start_timestamp', ''),
                'post2_survey_end_timestamp': survey_end_timestamp,
                'post2_survey_completed': 'yes',
                'post2_interaction_type': 'post_interaction_survey_2',
                'post2_timestamp': survey_end_timestamp
            })

            log_post_survey_2_data(survey_data)
            flask_session['post2_survey_completed'] = True
            return jsonify({'success': True, 'message': 'Post-survey 2 completed successfully'}), 200

        except Exception as e:
            app.logger.error(f"Error processing post-survey 2: {e}")
            return jsonify({'error': 'Error processing post-survey 2'}), 500

    try:
        flask_session['post2_survey_start_timestamp'] = str(datetime.now())
    except Exception as e:
        app.logger.error(f"Error logging post-survey 2 start: {e}")

    quit_redirection_link = url_settings.get('quit_url', 'https://www.prolific.com/')
    finish_redirection_link = url_settings.get('redirect_url', 'https://www.prolific.com/')

    survey_config = load_survey_config()
    post2_config = survey_config.get('post_survey_2', {}) if survey_config else {}

    completion_settings = post2_config.get('completion_settings', {})
    completion_instructions = completion_settings.get('completion_popup_message', 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx')
    finish_button_text = completion_settings.get('finish_button_text', 'Finish')

    if post2_config and post2_config.get('enabled', False):
        try:
            html_content = generate_post_survey_html_content(
                post2_config,
                quit_redirection_link,
                finish_redirection_link,
                completion_instructions,
                finish_button_text,
                submit_endpoint='/post-survey-2'
            )
            return html_content, 200, {'Content-Type': 'text/html'}
        except Exception as e:
            app.logger.error(f"Error generating dynamic post-survey 2: {e}")

    return render_template(
        'post_survey.html',
        quit_redirection_link=quit_redirection_link,
        finish_redirection_link=finish_redirection_link,
        completion_instructions=completion_instructions,
        finish_button_text=finish_button_text
    )

# DATA logging for post-interaction survey start
def log_post_survey_start(username, password, user_id):
    """Log when a user starts the post-survey"""
    try:
        post_survey_start_data = {
            'post_username': username,
            'post_password': password,
            'post_user_id': user_id,
            'post_survey_start_timestamp': str(datetime.now()),
            'post_survey_end_timestamp': '',
            'post_survey_completed': 'no',
            'post_interaction_type': 'post_survey_start'
        }
        
        flask_session['post_survey_start_timestamp'] = post_survey_start_data['post_survey_start_timestamp']
        
    except Exception as e:
        app.logger.error(f"Error logging post-survey start: {e}")

# Function to log popup data to dedicated popup files
def log_popup_data(data):
    """Log popup selections to dedicated popup JSON and CSV files"""
    try:
        data_dir = ensure_data_directory()
        popup_json_path = os.path.join(data_dir, 'popup.json')
        
        try:
            with open(popup_json_path, 'r') as f:
                file_content = f.read().strip()
                popup_data = json.loads(file_content) if file_content else {"popup_responses": []}
        except (FileNotFoundError, json.JSONDecodeError):
            popup_data = {"popup_responses": []}

        popup_data["popup_responses"].append(data)

        with open(popup_json_path, 'w') as f:
            json.dump(popup_data, f, indent=4)

        csv_headers = [
            "timestamp", "username", "password", "agent_name", "user_id", 
            "interaction_type", "button_selected"
        ]
        
        csv_data = [
            data.get('timestamp', ''),
            data.get('username', ''),
            data.get('password', ''),
            data.get('agent_name', ''),
            data.get('user_id', ''),
            data.get('interaction_type', ''),
            data.get('button_selected', '')
        ]

        csv_file = os.path.join(data_dir, 'popup.csv')
        write_headers = not os.path.exists(csv_file)

        with open(csv_file, 'a', newline='') as csvfile:
            writer = csv.writer(csvfile)
            if write_headers:
                writer.writerow(csv_headers)
            writer.writerow(csv_data)
            
    except Exception as e:
        app.logger.error(f"Error logging popup data: {e}")

# Function to log pre-survey data to dedicated pre-survey files
def log_pre_survey_data(data):
    """Log pre-survey responses to dedicated pre-survey JSON and CSV files"""
    try:
        data_dir = ensure_data_directory()
        survey_json_path = os.path.join(data_dir, 'pre_survey.json')
        
        try:
            with open(survey_json_path, 'r') as f:
                file_content = f.read().strip()
                survey_data = json.loads(file_content) if file_content else {"pre_survey_responses": []}
        except (FileNotFoundError, json.JSONDecodeError):
            survey_data = {"pre_survey_responses": []}

        survey_entry = {
            'username': data.get('pre_username', data.get('username', '')),
            'password': data.get('pre_password', data.get('password', '')),
            'agent_name': data.get('pre_agent_name', data.get('agent_name', '')),
            'user_id': data.get('pre_user_id', data.get('user_id', '')),
            'survey_start_timestamp': data.get('pre_survey_start_timestamp', data.get('survey_start_timestamp', '')),
            'survey_end_timestamp': data.get('pre_survey_end_timestamp', data.get('survey_end_timestamp', '')),
            'survey_completed': data.get('pre_survey_completed', data.get('survey_completed', 'no')),
            'interaction_type': data.get('pre_interaction_type', 'pre_interaction_survey')
        }
        
        for key, value in data.items():
            if key not in ['username', 'password', 'agent_name', 'user_id', 'survey_start_timestamp', 'survey_end_timestamp', 'survey_completed', 
                          'pre_username', 'pre_password', 'pre_agent_name', 'pre_user_id', 'pre_survey_start_timestamp', 'pre_survey_end_timestamp', 'pre_survey_completed',
                          'pre_interaction_type', 'pre_timestamp']:
                survey_entry[key] = value

        survey_data["pre_survey_responses"].append(survey_entry)

        # Log pre-survey JSON
        with open(survey_json_path, 'w') as f:
            json.dump(survey_data, f, indent=4)

        def _csv_safe(value):
            if isinstance(value, (dict, list)):
                try:
                    return json.dumps(value, ensure_ascii=False)
                except Exception:
                    return str(value)
            return value

        fixed_headers = [
            "username", "password", "agent_name", "user_id", "survey_start_timestamp",
            "survey_end_timestamp", "survey_completed", "interaction_type"
        ]

        row = {k: _csv_safe(v) for k, v in survey_entry.items()}
        for h in fixed_headers:
            row.setdefault(h, '')

        csv_file = os.path.join(ensure_data_directory(), 'pre_survey.csv')

        if os.path.exists(csv_file):
            with open(csv_file, 'r', newline='') as f:
                reader = csv.DictReader(f)
                existing_headers = reader.fieldnames or []

            missing_headers = [k for k in row.keys() if k not in existing_headers]

            if missing_headers:
                with open(csv_file, 'r', newline='') as f:
                    reader = csv.DictReader(f)
                    existing_rows = list(reader)
                    existing_headers = reader.fieldnames or []

                # Preserve existing order, append new keys in a stable order
                new_headers = existing_headers + [k for k in row.keys() if k not in existing_headers]

                with open(csv_file, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=new_headers, extrasaction='ignore')
                    writer.writeheader()
                    for r in existing_rows:
                        writer.writerow(r)
                    writer.writerow(row)
            else:
                with open(csv_file, 'a', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=existing_headers, extrasaction='ignore')
                    writer.writerow(row)
        else:
            other_headers = [k for k in row.keys() if k not in fixed_headers]
            headers = fixed_headers + other_headers
            with open(csv_file, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
                writer.writeheader()
                writer.writerow(row)
            
    except Exception as e:
        app.logger.error(f"Error logging pre-survey data: {e}")

# Function to log post-survey data to dedicated post-survey files
def log_post_survey_data(data):
    """Log post-survey responses to dedicated post-survey JSON and CSV files"""
    try:
        data_dir = ensure_data_directory()
        survey_json_path = os.path.join(data_dir, 'post_survey.json')
        
        try:
            with open(survey_json_path, 'r') as f:
                file_content = f.read().strip()
                survey_data = json.loads(file_content) if file_content else {"post_survey_responses": []}
        except (FileNotFoundError, json.JSONDecodeError):
            survey_data = {"post_survey_responses": []}

        survey_entry = {
            'username': data.get('post_username', ''),
            'password': data.get('post_password', ''),
            'agent_name': data.get('post_agent_name', ''),
            'user_id': data.get('post_user_id', ''),
            'survey_start_timestamp': data.get('post_survey_start_timestamp', ''),
            'survey_end_timestamp': data.get('post_survey_end_timestamp', ''),
            'survey_completed': data.get('post_survey_completed', 'no'),
            'interaction_type': data.get('post_interaction_type', 'post_interaction_survey')
        }
        
        for key, value in data.items():
            if key not in ['post_username', 'post_password', 'post_agent_name', 'post_user_id', 'post_survey_start_timestamp', 'post_survey_end_timestamp', 'post_survey_completed',
                          'post_interaction_type', 'post_timestamp']:
                survey_entry[key] = value

        survey_data["post_survey_responses"].append(survey_entry)

        # Log post-survey JSON
        with open(survey_json_path, 'w') as f:
            json.dump(survey_data, f, indent=4)
        def _csv_safe(value):
            if isinstance(value, (dict, list)):
                try:
                    return json.dumps(value, ensure_ascii=False)
                except Exception:
                    return str(value)
            return value

        fixed_headers = [
            "username", "password", "agent_name", "user_id", "survey_start_timestamp",
            "survey_end_timestamp", "survey_completed", "interaction_type"
        ]

        row = {k: _csv_safe(v) for k, v in survey_entry.items()}
        for h in fixed_headers:
            row.setdefault(h, '')

        csv_file = os.path.join(ensure_data_directory(), 'post_survey.csv')

        if os.path.exists(csv_file):
            with open(csv_file, 'r', newline='') as f:
                reader = csv.DictReader(f)
                existing_headers = reader.fieldnames or []

            missing_headers = [k for k in row.keys() if k not in existing_headers]

            if missing_headers:
                with open(csv_file, 'r', newline='') as f:
                    reader = csv.DictReader(f)
                    existing_rows = list(reader)
                    existing_headers = reader.fieldnames or []

                new_headers = existing_headers + [k for k in row.keys() if k not in existing_headers]

                with open(csv_file, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=new_headers, extrasaction='ignore')
                    writer.writeheader()
                    for r in existing_rows:
                        writer.writerow(r)
                    writer.writerow(row)
            else:
                with open(csv_file, 'a', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=existing_headers, extrasaction='ignore')
                    writer.writerow(row)
        else:
            other_headers = [k for k in row.keys() if k not in fixed_headers]
            headers = fixed_headers + other_headers
            with open(csv_file, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
                writer.writeheader()
                writer.writerow(row)
            
    except Exception as e:
        app.logger.error(f"Error logging post-survey data: {e}")


def log_post_survey_2_data(data):
    """Log post-survey 2 responses to dedicated post-survey 2 JSON and CSV files."""
    try:
        data_dir = ensure_data_directory()
        survey_json_path = os.path.join(data_dir, 'post_survey_2.json')

        def _atomic_write_json(path: str, payload: dict) -> None:
            fd, tmp_path = tempfile.mkstemp(prefix='post_survey_2.', suffix='.tmp', dir=os.path.dirname(path))
            try:
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, indent=4, ensure_ascii=False)
                os.replace(tmp_path, path)
            finally:
                try:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                except Exception:
                    pass

        try:
            with open(survey_json_path, 'r', encoding='utf-8') as f:
                file_content = f.read().strip()
                survey_data = json.loads(file_content) if file_content else {"post_survey_2_responses": []}
        except FileNotFoundError:
            survey_data = {"post_survey_2_responses": []}
        except json.JSONDecodeError:
            try:
                ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                corrupt_path = os.path.join(data_dir, f'post_survey_2.corrupt.{ts}.json')
                os.replace(survey_json_path, corrupt_path)
                app.logger.warning('Quarantined corrupt post_survey_2.json to %s', corrupt_path)
            except Exception as e:
                app.logger.error('Failed to quarantine corrupt post_survey_2.json: %s', e)
            survey_data = {"post_survey_2_responses": []}

        survey_entry = {
            'username': data.get('post2_username', ''),
            'password': data.get('post2_password', ''),
            'agent_name': data.get('post2_agent_name', ''),
            'user_id': data.get('post2_user_id', ''),
            'survey_start_timestamp': data.get('post2_survey_start_timestamp', ''),
            'survey_end_timestamp': data.get('post2_survey_end_timestamp', ''),
            'survey_completed': data.get('post2_survey_completed', 'no'),
            'interaction_type': data.get('post2_interaction_type', 'post_interaction_survey_2')
        }

        for key, value in data.items():
            if key not in [
                'post2_username', 'post2_password', 'post2_agent_name', 'post2_user_id',
                'post2_survey_start_timestamp', 'post2_survey_end_timestamp', 'post2_survey_completed',
                'post2_interaction_type', 'post2_timestamp'
            ]:
                survey_entry[key] = value

        survey_data.setdefault('post_survey_2_responses', []).append(survey_entry)
        _atomic_write_json(survey_json_path, survey_data)

        def _csv_safe(value):
            if isinstance(value, (dict, list)):
                try:
                    return json.dumps(value, ensure_ascii=False)
                except Exception:
                    return str(value)
            return value

        fixed_headers = [
            "username", "password", "agent_name", "user_id", "survey_start_timestamp",
            "survey_end_timestamp", "survey_completed", "interaction_type"
        ]

        row = {k: _csv_safe(v) for k, v in survey_entry.items()}
        for h in fixed_headers:
            row.setdefault(h, '')

        csv_file = os.path.join(ensure_data_directory(), 'post_survey_2.csv')

        if os.path.exists(csv_file):
            with open(csv_file, 'r', newline='') as f:
                reader = csv.DictReader(f)
                existing_headers = reader.fieldnames or []

            missing_headers = [k for k in row.keys() if k not in existing_headers]

            if missing_headers:
                with open(csv_file, 'r', newline='') as f:
                    reader = csv.DictReader(f)
                    existing_rows = list(reader)
                    existing_headers = reader.fieldnames or []

                new_headers = existing_headers + [k for k in row.keys() if k not in existing_headers]

                with open(csv_file, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=new_headers, extrasaction='ignore')
                    writer.writeheader()
                    for r in existing_rows:
                        writer.writerow(r)
                    writer.writerow(row)
            else:
                with open(csv_file, 'a', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=existing_headers, extrasaction='ignore')
                    writer.writerow(row)
        else:
            other_headers = [k for k in row.keys() if k not in fixed_headers]
            headers = fixed_headers + other_headers
            with open(csv_file, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
                writer.writeheader()
                writer.writerow(row)

    except Exception as e:
        app.logger.error(f"Error logging post-survey 2 data: {e}")

# Old survey function. Need to check not needed anymore then delete
def log_survey_data(data):
    """Legacy function - now routes to appropriate specific logging function based on data type"""
    try:
        is_post_survey = any(key.startswith('post_') for key in data.keys())
        
        if is_post_survey:
            log_post_survey_data(data)
        else:
            log_pre_survey_data(data)
            
    except Exception as e:
        app.logger.error(f"Error routing survey data: {e}")

# Timestamp logging for survey start times
def log_survey_start(username, password, user_id):
    """Log when a user starts the survey"""
    try:
        survey_start_data = {
            'username': username,
            'password': password,
            'user_id': user_id,
            'survey_start_timestamp': str(datetime.now()),
            'survey_end_timestamp': '',
            'survey_completed': 'no',
            'interaction_type': 'survey_start'
        }
        
        flask_session['survey_start_timestamp'] = survey_start_data['survey_start_timestamp']
        
    except Exception as e:
        app.logger.error(f"Error logging survey start: {e}")

def load_survey_config():
    """Load survey configuration from file, return None if not found"""
    try:
        survey_config_path = os.path.join(ensure_data_directory(), 'survey_config.json')
        with open(survey_config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except Exception as e:
        app.logger.error(f"Error loading survey config: {e}")
        return None

# This function deals with scraping the survey data from different section types
def collect_dynamic_survey_data(form_data, survey_config, prefix=''):
    """Collect survey data dynamically based on configuration"""
    survey_data = {}

    def _clean_label(label) -> str:
        if label is None:
            return ''
        return str(label).replace('\n', ' ').replace('\r', ' ').strip()

    def _apply_prefix(label: str) -> str:
        label = _clean_label(label)
        if not label:
            return ''
        if prefix and label.startswith(prefix):
            return label
        return f"{prefix}{label}" if prefix else label

    def _add_value(output_key: str, value):
        output_key = _apply_prefix(output_key)
        if not output_key:
            return
        if output_key in survey_data:
            base = output_key
            suffix = 2
            while f"{base}_{suffix}" in survey_data:
                suffix += 1
            output_key = f"{base}_{suffix}"
        survey_data[output_key] = value

    if not survey_config:
        for key, value in form_data.items():
            if value:
                prefixed_key = f"{prefix}{key}" if prefix else key
                survey_data[prefixed_key] = value
        return survey_data

    sections = survey_config.get('sections', {})
    consumed_form_keys = set()

    for section_key, section in sections.items():
        if not isinstance(section, dict) or not section.get('enabled', False):
            continue

        section_type = section.get('type', section_key.split('-')[0])
        section_dom_id = section_key.replace('-', '_')

        if section_type == 'demographics':
            demographics_fields = section.get('fields', {})

            if demographics_fields.get('age', {}).get('enabled', False) and 'age' in form_data:
                label = demographics_fields.get('age', {}).get('column_label') or 'age'
                _add_value(label, form_data.get('age'))
                consumed_form_keys.add('age')

            if demographics_fields.get('gender', {}).get('enabled', False) and 'gender' in form_data:
                label = demographics_fields.get('gender', {}).get('column_label') or 'gender'
                _add_value(label, form_data.get('gender'))
                consumed_form_keys.add('gender')

        elif section_type == 'likert':
            items = section.get('items', [])
            for i, item in enumerate(items):
                if isinstance(item, dict):
                    statement = item.get('statement') or item.get('text') or item.get('item') or ''
                    item_id = item.get('id', i)
                    label = item.get('column_label') or ''
                else:
                    statement = str(item)
                    item_id = i
                    label = ''

                field_name = f"likert_item_{item_id}"
                if field_name in form_data:
                    default_key = f"likert_{item_id}_{statement[:30]}" if statement else f"likert_{item_id}"
                    _add_value(label or default_key, form_data.get(field_name))
                    consumed_form_keys.add(field_name)

        elif section_type == 'freetext':
            questions = section.get('questions', [])
            for i, question_config in enumerate(questions):
                if isinstance(question_config, dict):
                    q_id = question_config.get('id', i)
                    label = question_config.get('column_label') or ''
                else:
                    q_id = i
                    label = ''

                field_name = f"free_text_response_{q_id}"
                if field_name in form_data:
                    _add_value(label or field_name, form_data.get(field_name))
                    consumed_form_keys.add(field_name)

        elif section_type == 'custom':
            fields = section.get('fields', [])
            for i, field_config in enumerate(fields):
                field_id = f"custom-field-{i}"
                label = ''
                field_type = 'text'
                if isinstance(field_config, dict):
                    label = field_config.get('column_label') or ''
                    field_type = field_config.get('type', 'text')

                if field_type == 'checkbox':
                    form_key = f"{field_id}[]"
                    values = form_data.getlist(form_key)
                    if values:
                        _add_value(label or field_id, values)
                        consumed_form_keys.add(form_key)
                else:
                    if field_id in form_data:
                        _add_value(label or field_id, form_data.get(field_id))
                        consumed_form_keys.add(field_id)

        elif section_type == 'checkbox':
            values = form_data.getlist(f"{section_dom_id}_response[]")
            if values:
                _add_value(section.get('column_label') or f"{section_dom_id}_response", values)
                consumed_form_keys.add(f"{section_dom_id}_response[]")

        elif section_type == 'dropdown':
            form_key = f"{section_dom_id}_response"
            if form_key in form_data:
                _add_value(section.get('column_label') or form_key, form_data.get(form_key))
                consumed_form_keys.add(form_key)

        elif section_type == 'slider':
            form_key = f"{section_dom_id}_response"
            if form_key in form_data:
                _add_value(section.get('column_label') or form_key, form_data.get(form_key))
                consumed_form_keys.add(form_key)

        elif section_type in ['image', 'video', 'pdf']:
            response_type = section.get('response_type')
            if response_type == 'rating':
                form_key = f"{section_dom_id}_rating"
                if form_key in form_data:
                    _add_value(section.get('rating_column_label') or form_key, form_data.get(form_key))
                    consumed_form_keys.add(form_key)
            elif response_type == 'text':
                form_key = f"{section_dom_id}_text"
                if form_key in form_data:
                    _add_value(section.get('text_column_label') or form_key, form_data.get(form_key))
                    consumed_form_keys.add(form_key)
            elif response_type == 'checkbox':
                form_key = f"{section_dom_id}_checkbox[]"
                values = form_data.getlist(form_key)
                if values:
                    _add_value(section.get('checkbox_column_label') or f"{section_dom_id}_checkbox", values)
                    consumed_form_keys.add(form_key)
            elif response_type == 'confirmation':
                form_key = f"{section_dom_id}_response"
                if form_key in form_data:
                    _add_value(section.get('confirmation_column_label') or form_key, form_data.get(form_key))
                    consumed_form_keys.add(form_key)

    for key, value in form_data.items():
        if key in consumed_form_keys:
            continue
        prefixed_key = f"{prefix}{key}" if prefix else key
        if prefixed_key not in survey_data and value:
            survey_data[prefixed_key] = value

    return survey_data

# CHAT route 
@app.route('/chat', methods=['GET', 'POST'])
def chat():
    if 'username' not in flask_session:
        return redirect(url_for('login'))
    
    # Check if user has completed the survey
    if not flask_session.get('survey_completed'):
        return redirect(url_for('survey'))

    try:
        agent = flask_session.get('agent', 'default')
        API.update_agent(f"agents/{agent}.json")
        _initialize_autonomy_state_from_loaded_agent()
        conversation = get_messages(flask_session['user_id'], flask_session['password'], flask_session.get('interaction_round', 1))

        if request.method == 'POST':
            message = request.form.get('message')
            if not message:
                flash('Message cannot be empty', 'error')
                return jsonify({'error': 'Message cannot be empty'}), 400
            
            model = API.agent_data.get("model") or current_model or "gpt-4.1"
            try:
                conversation, prompt_tokens, completion_tokens, total_tokens, logprobs_list, actual_model = API.thinkAbout(message, conversation, model=model)
                response = conversation[-1]["content"]
                print(f"AI Response complete. Model used: {actual_model}, Tokens: {total_tokens}")
            except Exception as e:
                app.logger.error(f"Error processing message: {e}")
                return jsonify({'error': 'Error processing message'}), 500

            user_id = flask_session['user_id']
            password = flask_session['password']
            add_message(user_id, password, message, str(response), actual_model, API.agent_data.get("temperature", 1), prompt_tokens, completion_tokens, total_tokens, logprobs_list)

            injector = AutonomyInjector(API.agent_data)
            state = _autonomy_session_snapshot()
            injector.register_user_prompt(state)
            _autonomy_session_commit(state)

            return jsonify({'response': response})

        url_settings = get_url_settings_from_db()
        branding_settings = get_branding_settings_from_db()
        
        return render_template('chat.html', 
                             username=flask_session['username'], 
                             messages=conversation, 
                             quit_button_text=url_settings['quit_button_text'],
                             redirect_button_text=url_settings['redirect_button_text'],
                             chat_header_line1=branding_settings['chat_header_line1'],
                             chat_header_line2=branding_settings['chat_header_line2'])
    except Exception as ex:
        app.logger.error(f"Unexpected error occurred: {ex}")
        return jsonify({'error': 'Unexpected error occurred'}), 500


@app.route('/chat-autonomy-next', methods=['GET'])
def chat_autonomy_next():
    """Return the next autonomous assistant message when due."""
    if 'username' not in flask_session:
        return jsonify({'enabled': False, 'has_response': False}), 401

    if not flask_session.get('survey_completed'):
        return jsonify({'enabled': False, 'has_response': False}), 403

    try:
        agent = flask_session.get('agent', 'default')
        API.update_agent(f"agents/{agent}.json")

        injector = AutonomyInjector(API.agent_data)
        state = _autonomy_session_snapshot()
        injector.initialize_state(state)

        if not state.get('autonomy_enabled'):
            _autonomy_session_commit(state)
            return jsonify({'enabled': False, 'has_response': False}), 200

        if not injector.is_due(state):
            _autonomy_session_commit(state)
            return jsonify({'enabled': True, 'has_response': False}), 200

        conversation = get_messages(flask_session['user_id'], flask_session['password'], flask_session.get('interaction_round', 1))
        model = API.agent_data.get("model") or current_model or "gpt-4.1"

        conversation, prompt_tokens, completion_tokens, total_tokens, logprobs_list, actual_model = API.thinkAbout(
            injector.prompt,
            conversation,
            model=model
        )
        response = conversation[-1]["content"]

        add_message(
            flask_session['user_id'],
            flask_session['password'],
            injector.prompt,
            str(response),
            actual_model,
            API.agent_data.get("temperature", 1),
            prompt_tokens,
            completion_tokens,
            total_tokens,
            logprobs_list
        )

        injector.mark_injected(state)
        _autonomy_session_commit(state)

        return jsonify({'enabled': True, 'has_response': True, 'response': response}), 200

    except Exception as ex:
        app.logger.error(f"Autonomy injector error: {ex}")
        return jsonify({'enabled': True, 'has_response': False, 'error': 'Autonomy injection failed'}), 500


@app.route('/chat-finish-inject', methods=['POST'])
def chat_finish_inject():
    """Inject a one-off 'finish interaction' assistant message.

    Triggered by the user clicking the "Yes" button on the finish confirmation.
    Uses the same agent JSON parameters and LLM pipeline as the standard chat.
    """
    if 'username' not in flask_session:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    if not flask_session.get('survey_completed'):
        return jsonify({'success': False, 'error': 'Survey incomplete'}), 403

    # Avoid multiple injections if the user clicks "Yes" repeatedly.
    if flask_session.get('finish_injected_once'):
        return jsonify({'success': True, 'skipped': True}), 200

    try:
        agent = flask_session.get('agent', 'default')
        API.update_agent(f"agents/{agent}.json")

        conversation = get_messages(flask_session['user_id'], flask_session['password'], flask_session.get('interaction_round', 1))
        model = API.agent_data.get("model") or current_model or "gpt-4.1"

        injector = FinishInteractionInjector(API.agent_data)

        # Per-agent toggle (aka "Objection Injector" in the dashboard)
        if not getattr(injector, 'enabled', True):
            flask_session['finish_injected_once'] = True
            return jsonify({'success': True, 'skipped': True}), 200

        conversation, prompt_tokens, completion_tokens, total_tokens, logprobs_list, actual_model = API.thinkAbout(
            injector.prompt,
            conversation,
            model=model
        )
        response = conversation[-1]["content"]

        add_message(
            flask_session['user_id'],
            flask_session['password'],
            injector.prompt,
            str(response),
            actual_model,
            API.agent_data.get("temperature", 1),
            prompt_tokens,
            completion_tokens,
            total_tokens,
            logprobs_list
        )

        flask_session['finish_injected_once'] = True
        return jsonify({'success': True, 'response': response}), 200

    except Exception as ex:
        app.logger.error(f"Finish injector error: {ex}")
        return jsonify({'success': False, 'error': 'Finish injection failed'}), 500

# Researcher dashboard routes and functions
@app.route('/researcher', methods=['POST'])
def researcher_login():
    researcher_username = request.form['researcher_username']
    researcher_password = request.form['researcher_password']
    if authenticate_researcher(researcher_username, researcher_password):
        flask_session['researcher'] = True
        return jsonify({'success': True}), 200
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

@app.route('/research_dashboard', methods=['GET'])
def research_dashboard():
    if not flask_session.get('researcher'):
        return redirect(url_for('researcher_login'))
    
    log_visitor('researcher_dashboard')
    
    return render_template('research_dashboard.html')

def authenticate_researcher(researcher_username, researcher_password):
    """Authenticate researcher credentials against environment variables"""
    env_username = os.environ.get('researcher_username')
    env_password = os.environ.get('researcher_password')
    
    print(f"Auth attempt - Username: {researcher_username}, Env username: {env_username}")
    print(f"Auth attempt - Password provided: {'Yes' if researcher_password else 'No'}, Env password set: {'Yes' if env_password else 'No'}")
    
    return (researcher_username == env_username and 
            researcher_password == env_password)

# Needed to add this to reload the env without having to redeploy while testing
@app.route('/reload-env', methods=['POST'])
def reload_env():
    """Reload environment variables from .env file - DEVELOPMENT ONLY"""
    if not flask_session.get('researcher'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        load_dotenv(override=True)
        
        env_valid = validate_env_variables()
        
        return jsonify({
            'success': True, 
            'message': 'Environment variables reloaded successfully',
            'validation_passed': env_valid,
            'researcher_username': os.environ.get('researcher_username', 'NOT_SET'),
            'researcher_password_set': bool(os.environ.get('researcher_password'))
        })
    except Exception as e:
        return jsonify({'error': f'Failed to reload environment: {str(e)}'}), 500

# These are both for loading in Agent JSON files and reviewing the conditions in the researcher access
@app.route('/list-json-files')
def list_json_files():
    files = [f for f in os.listdir(AGENTS_FOLDER) if f.endswith('.json')]
    return jsonify(files)

@app.route('/get-file-content')
def get_file_content():
    filename = request.args.get('name')
    try:
        if filename and filename.endswith('.json'):
            return send_from_directory(AGENTS_FOLDER, filename)
        else:
            return 'Invalid file name', 400
    except FileNotFoundError:
        return 'File not found', 404

# Route for agent creation in researcher dashboard
@app.route('/create-json', methods=['POST'])
def create_json_file():
    data = request.json or {}
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "Missing filename"}), 400

    autonomy_prompt = str(data.get("autonomy_injector_prompt") or "").strip()
    if not autonomy_prompt:
        data["autonomy_injector_prompt"] = AutonomyInjector.DEFAULT_PROMPT
    else:
        data["autonomy_injector_prompt"] = autonomy_prompt

    # Objection injector (finish-interaction injection)
    # Keep prompt empty by default so the injector's python-side DEFAULT_PROMPT is used.
    objection_prompt = str(data.get("objection_injector_prompt") or "").strip()
    try:
        tmp_injector = FinishInteractionInjector({"objection_injector_prompt": objection_prompt})
        if objection_prompt and tmp_injector.prompt == FinishInteractionInjector.DEFAULT_PROMPT:
            data["objection_injector_prompt"] = ""
        else:
            data["objection_injector_prompt"] = objection_prompt
    except Exception:
        data["objection_injector_prompt"] = ""
    
    with open(f'agents/{filename}.json', 'w') as jsonfile:
        json.dump(data, jsonfile, indent=2)

    return jsonify({"message": "File created successfully"}), 201

# This is for updating the agent passwords set in the researcher dashboard
def update_password_dict():
    global passwords
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT password, agent FROM passwords')
    rows = c.fetchall()
    passwords = {password: agent for password, agent in rows}
    conn.close()

add_passwords()
update_password_dict()

# This is for updating passwords in the db
@app.route('/update-passwords', methods=['POST'])
def update_passwords():
    data = request.json
    password = data.get('password')
    agent = data.get('agent')
    
    if not password or not agent:
        return jsonify({'error': 'Invalid data'}), 400

    try:
        # Enforce: only within-subjects conditions may share passwords.
        cfg = _load_agent_config(agent)
        ws = _get_within_subjects_fields(cfg)
        is_within_subjects = bool(ws.get('enabled'))
        condition_value = str(ws.get('condition') or '').strip() if is_within_subjects else ''

        if is_within_subjects:
            if not condition_value:
                return jsonify({'error': 'Within-subjects agents must have a condition value.'}), 400

            existing_password = _get_existing_condition_password(condition_value, exclude_agent=agent)
            assigned_password = existing_password or password
            if not assigned_password:
                return jsonify({'error': 'Password cannot be empty'}), 400

            # Guard: condition passwords must not collide with non-within-subject agents or other conditions.
            conn = sqlite3.connect('users.db')
            c = conn.cursor()
            try:
                c.execute('SELECT agent FROM agent_passwords WHERE password = ? AND agent != ?', (assigned_password, agent))
                colliding_agents = [row[0] for row in (c.fetchall() or []) if row and row[0]]
            finally:
                conn.close()

            for other_agent in colliding_agents:
                other_cfg = _load_agent_config(other_agent)
                other_ws = _get_within_subjects_fields(other_cfg)
                other_is_ws = bool(other_ws.get('enabled'))
                other_condition = str(other_ws.get('condition') or '').strip() if other_is_ws else ''
                if (not other_is_ws) or (other_condition != condition_value):
                    return jsonify({
                        'error': (
                            f'Password "{assigned_password}" is already used by another agent outside this within-subjects condition. '
                            'Choose a unique password for this condition.'
                        )
                    }), 400

            # Preserve current active state if exists
            _pw, is_active = _get_agent_password_record(agent)
            _upsert_agent_password(agent, assigned_password, bool(is_active) if is_active is not None else True)
            _sync_condition_password(condition_value, assigned_password)

            return jsonify({
                'message': 'Password updated successfully',
                'assigned_password': assigned_password,
                'forced': bool(existing_password) and (existing_password != password)
            }), 200

        # Non within-subjects: prevent accidental shared passwords.
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        try:
            c.execute('SELECT agent FROM agent_passwords WHERE password = ? AND agent != ?', (password, agent))
            conflict = c.fetchone()
            if conflict:
                return jsonify({
                    'error': 'Password already in use by another agent. Shared passwords are only allowed for within-subjects conditions.'
                }), 400

            _pw, is_active = _get_agent_password_record(agent)
            _upsert_agent_password(agent, password, bool(is_active) if is_active is not None else True)
        finally:
            conn.close()

        return jsonify({'message': 'Password updated successfully', 'assigned_password': password, 'forced': False}), 200
    except sqlite3.Error as e:
        return jsonify({'error': str(e)}), 500

# This is for reviewing agent passwords in the researcher dashboard
@app.route('/get-passwords', methods=['GET'])
def get_passwords():
    connection = sqlite3.connect('users.db')
    cursor = connection.cursor()

    query = "SELECT agent, password, is_active FROM agent_passwords ORDER BY agent"
    cursor.execute(query)

    passwords = [{"agent": row[0], "password": row[1], "is_active": bool(row[2])} for row in cursor.fetchall()]

    connection.close()
    
    return jsonify(passwords)


@app.route('/get-within-subjects-condition-password', methods=['GET'])
def get_within_subjects_condition_password_route():
    """Used by the researcher dashboard: if a within-subjects condition already exists, return its locked password."""
    if not flask_session.get('researcher'):
        return jsonify({'error': 'Unauthorized'}), 401

    condition_value = str(request.args.get('condition') or '').strip()
    if not condition_value:
        return jsonify({'password': None}), 200

    pw = _get_existing_condition_password(condition_value)
    return jsonify({'password': pw}), 200

# For randomising agent assignment master password
@app.route('/get-randomised-password', methods=['GET'])
def get_randomised_password_route():
    """Get the current randomised agent password"""
    try:
        password = get_randomised_agent_password()
        return jsonify({'password': password}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/update-randomised-password', methods=['POST'])
def update_randomised_password_route():
    """Update the randomised agent password"""
    try:
        data = request.json
        new_password = data.get('password', '').strip()
        
        if not new_password:
            return jsonify({'error': 'Password cannot be empty'}), 400
            
        update_randomised_agent_password(new_password)
        return jsonify({'message': 'Randomised agent password updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get-agents-with-status', methods=['GET'])
def get_agents_with_status_route():
    """Get all agents with their active status and details"""
    try:
        agents = get_all_agents_with_status()
        agent_details = []
        
        for agent_name, password, is_active in agents:
            try:
                with open(f'agents/{agent_name}.json', 'r') as f:
                    agent_config = json.load(f)
                agent_details.append({
                    'password': password,
                    'agent_name': agent_name,
                    'is_active': bool(is_active),
                    'config': agent_config
                })
            except FileNotFoundError:
                agent_details.append({
                    'password': password,
                    'agent_name': agent_name,
                    'is_active': bool(is_active),
                    'config': {'error': 'Agent file not found'}
                })
        
        return jsonify({'agents': agent_details}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/update-agent-status', methods=['POST'])
def update_agent_status_route():
    """Update the active status of an agent"""
    try:
        data = request.json
        password = data.get('password')
        agent_name = data.get('agent_name')
        is_active = data.get('is_active', True)

        if not agent_name and not password:
            return jsonify({'error': 'agent_name or password is required'}), 400

        # Within-subjects: active/inactive is effectively per-condition.
        if agent_name:
            condition_value = _get_within_subjects_condition_for_agent(agent_name)
            if condition_value:
                pair = _find_within_subjects_pair(condition_value)
                targets = pair if pair else [agent_name]
                for target_agent in targets:
                    update_agent_active_state(agent_name=target_agent, is_active=is_active)
                return jsonify({'message': 'Condition status updated successfully', 'updated_condition': condition_value}), 200

        update_agent_active_state(agent_name=agent_name, password=password, is_active=is_active)
        return jsonify({'message': 'Agent status updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/delete-agent', methods=['POST'])
def delete_agent_route():
    """Delete an agent configuration and its password assignment"""
    try:
        data = request.json
        password = data.get('password')
        agent_name = data.get('agent_name')
        
        if not agent_name:
            return jsonify({'error': 'agent_name is required'}), 400
        
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        c.execute('DELETE FROM agent_passwords WHERE agent = ?', (agent_name,))
        conn.commit()
        conn.close()
        
        agent_file_path = f'agents/{agent_name}.json'
        if os.path.exists(agent_file_path):
            os.remove(agent_file_path)
            
        return jsonify({'message': 'Agent deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# This is for local download of data files in researcher dashboard
@app.route('/download/<filename>')
def download_file(filename):
    directory = '.'  

    if not os.path.exists(os.path.join(directory, filename)):
        abort(404)  

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    data_dir = ensure_data_directory()
    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(directory, filename, as_attachment=True)

# Old survey data download route. Check these two routes and then delete if not needed
@app.route('/download-survey-json')
def download_survey_json():
    """Download survey.json file (legacy - contains mixed pre/post survey data)"""
    filename = 'survey.json'
    data_dir = ensure_data_directory()
    
    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

@app.route('/download-survey-csv')
def download_survey_csv():
    """Download survey.csv file (legacy - contains mixed pre/post survey data)"""
    filename = 'survey.csv'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

# Pre-survey data download routes
@app.route('/download-pre-survey-json')
def download_pre_survey_json():
    """Download pre_survey.json file"""
    filename = 'pre_survey.json'
    data_dir = ensure_data_directory()
    
    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

@app.route('/download-pre-survey-csv')
def download_pre_survey_csv():
    """Download pre_survey.csv file"""
    filename = 'pre_survey.csv'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

# Post-survey data download routes
@app.route('/download-post-survey-json')
def download_post_survey_json():
    """Download post_survey.json file"""
    filename = 'post_survey.json'
    data_dir = ensure_data_directory()
    
    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

@app.route('/download-post-survey-csv')
def download_post_survey_csv():
    """Download post_survey.csv file"""
    filename = 'post_survey.csv'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)


# Post-survey 2 data download routes
@app.route('/download-post-survey-2-json')
def download_post_survey_2_json():
    """Download post_survey_2.json file"""
    filename = 'post_survey_2.json'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')

    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)


@app.route('/download-post-survey-2-csv')
def download_post_survey_2_csv():
    """Download post_survey_2.csv file"""
    filename = 'post_survey_2.csv'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')

    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

# Popup data download routes
@app.route('/download-popup-json')
def download_popup_json():
    """Download popup.json file"""
    filename = 'popup.json'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

@app.route('/download-popup-csv')
def download_popup_csv():
    """Download popup.csv file"""
    filename = 'popup.csv'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

# Interactions data download routes
@app.route('/download-interactions-json')
def download_interactions_json():
    """Download interactions.json file"""
    filename = 'interactions.json'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

@app.route('/download-interactions-csv')
def download_interactions_csv():
    """Download interactions_backup.csv file"""
    filename = 'interactions_backup.csv'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

# Download log route
@app.route('/download-download-log')
def download_download_log():
    """Download download_log.json file"""
    filename = 'download_log.json'
    data_dir = ensure_data_directory()

    if not os.path.exists(os.path.join(data_dir, filename)):
        abort(404)

    log_entry = {
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
        "client_ip": request.remote_addr
    }

    download_log_path = os.path.join(data_dir, 'download_log.json')
    
    if not os.path.exists(download_log_path):
        with open(download_log_path, 'w') as log_file:
            log_file.write('')

    with open(download_log_path, 'a') as log_file:
        log_file.write(json.dumps(log_entry) + '\n')

    return send_from_directory(data_dir, filename, as_attachment=True)

@app.route('/download-visitor-log')
def download_visitor_log():
    """This is to download visitor_log.json file"""
    if not flask_session.get('researcher'):
        return jsonify({"error": "Unauthorized"}), 401
    
    data_dir = ensure_data_directory()
    visitor_log_path = os.path.join(data_dir, 'visitor_log.json')
    
    if not os.path.exists(visitor_log_path):
        with open(visitor_log_path, 'w') as f:
            json.dump([], f)
    
    return send_file(
        visitor_log_path,
        as_attachment=True,
        download_name=f'visitor_log_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json',
        mimetype='application/json'
    )

# Timer settings routes
@app.route('/get-timer-settings', methods=['GET'])
def get_timer_settings():
    """Get current timer settings"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    c.execute('SELECT setting_value FROM url_settings WHERE setting_name = ?', ('timer_duration_minutes',))
    result = c.fetchone()
    conn.close()
    
    duration_minutes = int(result[0]) if result else 10
    
    timer_settings = {
        'duration_minutes': duration_minutes
    }
    return jsonify(timer_settings)

@app.route('/update-timer-settings', methods=['POST'])
def update_timer_settings():
    """Update timer settings"""
    data = request.json
    duration_minutes = data.get('duration_minutes', 10)
    
    if not isinstance(duration_minutes, int) or duration_minutes < 1 or duration_minutes > 120:
        return jsonify({'error': 'Duration must be between 1 and 120 minutes'}), 400
    
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('INSERT OR REPLACE INTO url_settings (setting_name, setting_value) VALUES (?, ?)', 
              ('timer_duration_minutes', str(duration_minutes)))
    conn.commit()
    conn.close()
    
    os.environ['TIMER_DURATION_MINUTES'] = str(duration_minutes)
    
    return jsonify({'message': 'Timer settings updated successfully'})

# URL configuration routes
def get_url_settings_from_db():
    """Get URL settings from database"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS url_settings 
                 (setting_name TEXT PRIMARY KEY, 
                 setting_value TEXT NOT NULL)''')
    
    c.execute('SELECT setting_name, setting_value FROM url_settings')
    settings = dict(c.fetchall())
    conn.close()
    
    return {
        'quit_url': settings.get('quit_url', 'https://www.prolific.com/'),
        'redirect_url': settings.get('redirect_url', 'https://www.prolific.com/'),
        'quit_button_text': settings.get('quit_button_text', 'Quit Study'),
        'redirect_button_text': settings.get('redirect_button_text', 'Continue to Survey'),
        'use_post_survey': settings.get('use_post_survey', 'false').lower() in ('true', '1', 'yes', 'on'),
        'trigger_type': settings.get('trigger_type', 'messages'),
        'stage1_messages': int(settings.get('stage1_messages', '5')),
        'stage2_messages': int(settings.get('stage2_messages', '10')),
        'stage3_messages': int(settings.get('stage3_messages', '15')),
        'stage1_time': float(settings.get('stage1_time', '2')),
        'stage2_time': float(settings.get('stage2_time', '5')),
        'stage3_time': float(settings.get('stage3_time', '8')),
        'timer_duration_minutes': int(settings.get('timer_duration_minutes', '10')),
        'post_chat_popup_enabled': settings.get('post_chat_popup_enabled', 'false').lower() in ('true', '1', 'yes', 'on'),
        'post_chat_popup_text': settings.get('post_chat_popup_text', 'Please provide your feedback on the AI system:'),
        'post_chat_popup_button1_text': settings.get('post_chat_popup_button1_text', 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--'),
        'post_chat_popup_button2_text': settings.get('post_chat_popup_button2_text', 'Feedback to the AI that it is useful --This system will then be permenantly deleted--')
    }

def get_branding_settings_from_db():
    """Get branding settings from database"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS url_settings 
                 (setting_name TEXT PRIMARY KEY, 
                 setting_value TEXT NOT NULL)''')
    
    branding_keys = [
        'login_title', 'login_footer_line1', 'login_footer_line2', 'login_footer_line3',
        'chat_header_line1', 'chat_header_line2'
    ]
    
    settings = {}
    for key in branding_keys:
        c.execute('SELECT setting_value FROM url_settings WHERE setting_name = ?', (key,))
        result = c.fetchone()
        if result:
            settings[key] = result[0]
    
    conn.close()
    
    default_settings = {
        'login_title': 'Artificial Intelligence <br>Gateway',
        'login_footer_line1': 'chatPsych',
        'login_footer_line2': 'Powered by',
        'login_footer_line3': 'The Australian Institute for Machine Learning',
        'chat_header_line1': 'Australian Institute for Machine&nbsp;Learning',
        'chat_header_line2': 'chatPsych'
    }
    
    for key, default_value in default_settings.items():
        if key not in settings:
            settings[key] = default_value
    
    return settings

def save_url_settings_to_db(settings):
    """Save URL settings to database"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS url_settings 
                 (setting_name TEXT PRIMARY KEY, 
                 setting_value TEXT NOT NULL)''')
    
    for key, value in settings.items():
        if isinstance(value, bool):
            value = 'true' if value else 'false'
        c.execute('INSERT OR REPLACE INTO url_settings (setting_name, setting_value) VALUES (?, ?)', 
                  (key, str(value)))
    
    conn.commit()
    conn.close()

@app.route('/get-url-settings', methods=['GET'])
def get_url_settings():
    """Get current URL settings"""
    url_settings = get_url_settings_from_db()
    return jsonify(url_settings)

@app.route('/update-url-settings', methods=['POST'])
def update_url_settings():
    """Update URL settings"""
    data = request.json
    quit_url = data.get('quit_url', '')
    redirect_url = data.get('redirect_url', '')
    quit_button_text = data.get('quit_button_text', 'Quit Study')
    redirect_button_text = data.get('redirect_button_text', 'Continue to Survey')
    use_post_survey = data.get('use_post_survey', False)
    trigger_type = data.get('trigger_type', 'messages')
    stage1_messages = data.get('stage1_messages', 5)
    stage2_messages = data.get('stage2_messages', 10)
    stage3_messages = data.get('stage3_messages', 15)
    stage1_time = data.get('stage1_time', 2)
    stage2_time = data.get('stage2_time', 5)
    stage3_time = data.get('stage3_time', 8)
    timer_duration_minutes = data.get('timer_duration_minutes', 10)
    
    post_chat_popup_enabled = data.get('post_chat_popup_enabled', False)
    post_chat_popup_text = data.get('post_chat_popup_text', 'Please provide your feedback on the AI system:')
    post_chat_popup_button1_text = data.get('post_chat_popup_button1_text', 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--')
    post_chat_popup_button2_text = data.get('post_chat_popup_button2_text', 'Feedback to the AI that it is useful --This system will then be permenantly deleted--')
    
    if not quit_url or not redirect_url:
        return jsonify({'error': 'Both quit_url and redirect_url are required'}), 400
    
    try:
        from urllib.parse import urlparse
        quit_parsed = urlparse(quit_url)
        if not use_post_survey: 
            redirect_parsed = urlparse(redirect_url)
            if not all([redirect_parsed.scheme, redirect_parsed.netloc]):
                return jsonify({'error': 'Invalid redirect URL format. URLs must include protocol (http:// or https://)'}), 400
        
        if not all([quit_parsed.scheme, quit_parsed.netloc]):
            return jsonify({'error': 'Invalid quit URL format. URLs must include protocol (http:// or https://)'}), 400
    except Exception as e:
        return jsonify({'error': 'Invalid URL format'}), 400
    
    if trigger_type not in ['messages', 'time']:
        return jsonify({'error': 'Invalid trigger type. Must be "messages" or "time"'}), 400
    
    if trigger_type == 'messages':
        if not all(isinstance(x, int) and x > 0 for x in [stage1_messages, stage2_messages, stage3_messages]):
            return jsonify({'error': 'Message trigger values must be positive integers'}), 400
    
    if trigger_type == 'time':
        if not all(isinstance(x, (int, float)) and x > 0 for x in [stage1_time, stage2_time, stage3_time]):
            return jsonify({'error': 'Time trigger values must be positive numbers'}), 400
    
    if not isinstance(timer_duration_minutes, (int, float)) or timer_duration_minutes <= 0:
        return jsonify({'error': 'Timer duration must be a positive number'}), 400
    
    settings = {
        'quit_url': quit_url,
        'redirect_url': redirect_url,
        'quit_button_text': quit_button_text,
        'redirect_button_text': redirect_button_text,
        'use_post_survey': 'true' if use_post_survey else 'false',
        'trigger_type': trigger_type,
        'stage1_messages': stage1_messages,
        'stage2_messages': stage2_messages,
        'stage3_messages': stage3_messages,
        'stage1_time': stage1_time,
        'stage2_time': stage2_time,
        'stage3_time': stage3_time,
        'timer_duration_minutes': timer_duration_minutes,
        'post_chat_popup_enabled': 'true' if post_chat_popup_enabled else 'false',
        'post_chat_popup_text': post_chat_popup_text,
        'post_chat_popup_button1_text': post_chat_popup_button1_text,
        'post_chat_popup_button2_text': post_chat_popup_button2_text
    }
    
    save_url_settings_to_db(settings)
    
    os.environ['QUIT_URL'] = quit_url
    os.environ['REDIRECT_URL'] = redirect_url
    
    return jsonify({'success': True, 'message': 'URL settings updated successfully'})

@app.route('/get-redirect-urls', methods=['GET'])
def get_redirect_urls():
    """API endpoint for the chat interface to get current redirect URLs"""
    settings = get_url_settings_from_db()
    post_survey_url = '/post-survey'
    if flask_session.get('within_subjects_enabled') and int(flask_session.get('interaction_round', 1) or 1) == 2:
        post_survey_url = '/post-survey-2'
    return jsonify({
        'quit_url': settings['quit_url'],
        'redirect_url': settings['redirect_url'],
        'use_post_survey': settings['use_post_survey'],
        'post_survey_url': post_survey_url
    })

@app.route('/get-trigger-settings', methods=['GET'])
def get_trigger_settings():
    """API endpoint for the chat interface to get trigger settings"""
    settings = get_url_settings_from_db()
    return jsonify({
        'trigger_type': settings['trigger_type'],
        'stage1_messages': settings['stage1_messages'],
        'stage2_messages': settings['stage2_messages'], 
        'stage3_messages': settings['stage3_messages'],
        'stage1_time': settings['stage1_time'],
        'stage2_time': settings['stage2_time'],
        'stage3_time': settings['stage3_time'],
        'quit_button_text': settings['quit_button_text'],
        'redirect_button_text': settings['redirect_button_text'],
        'use_post_survey': settings['use_post_survey']
    })

@app.route('/log-post-chat-popup', methods=['POST'])
def log_post_chat_popup():
    """Log post-chat popup selection"""
    try:
        data = request.json
        button_text = data.get('button_text', '')
        
        username = flask_session.get('username', 'Unknown')
        user_id = flask_session.get('user_id', 'Unknown')
        password = flask_session.get('password', 'Unknown')
        agent_name = flask_session.get('agent', 'Unknown')
        
        popup_data = {
            'timestamp': str(datetime.now()),
            'username': username,
            'password': password,
            'agent_name': agent_name,
            'user_id': user_id,
            'interaction_type': 'post_chat_popup_selection',
            'button_selected': button_text
        }
        
        log_popup_data(popup_data)
        
        return jsonify({'success': True, 'message': 'Post-chat popup selection logged successfully'})
        
    except Exception as e:
        app.logger.error(f"Error logging post-chat popup selection: {e}")
        return jsonify({'error': 'Error logging post-chat popup selection'}), 500

# Survey Config Routes
@app.route('/save-survey-config', methods=['POST'])
def save_survey_config():
    """Save survey configuration to file"""
    try:
        config = request.json
        
        validation_error = validate_survey_config(config)
        if validation_error:
            return jsonify({'success': False, 'error': validation_error}), 400
        # Saving the config file here
        survey_config_path = os.path.join(ensure_data_directory(), 'survey_config.json')
        with open(survey_config_path, 'w') as f:
            json.dump(config, f, indent=4)
        
        try:
            generate_survey_html(config)
        except Exception as e:
            app.logger.error(f"Error generating survey HTML: {e}")
        
        return jsonify({'success': True, 'message': 'Survey configuration saved successfully'})
    except Exception as e:
        app.logger.error(f"Error saving survey config: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def validate_survey_config(config):
    """Validate survey configuration structure"""
    if not isinstance(config, dict):
        return "Configuration must be a valid JSON object"
    
    if 'title' not in config:
        return "Survey title is required"
    
    sections = config.get('sections', {})
    if sections:
        for section_key, section in sections.items():
            if not isinstance(section, dict) or not section.get('enabled', False):
                continue

            section_type = section.get('type', section_key.split('-')[0])

            if section_type == 'demographics':
                demo_fields = section.get('fields', {})
                if not demo_fields:
                    return "Demographics section is enabled but has no fields configured"
                has_enabled_field = bool(demo_fields.get('age', {}).get('enabled')) or bool(demo_fields.get('gender', {}).get('enabled'))
                if not has_enabled_field:
                    return f"Demographics section '{section_key}' is enabled but has no fields enabled"

            if section_type == 'likert':
                likert_items = section.get('items', [])
                if not likert_items:
                    return f"Likert section '{section_key}' is enabled but has no items configured"

            if section_type == 'freetext':
                freetext_questions = section.get('questions', [])
                if not freetext_questions:
                    return f"Free text section '{section_key}' is enabled but has no questions configured"

            if section_type in ['image', 'video', 'pdf']:
                if section_type == 'video':
                    has_file = section.get('file_path') or section.get('video_url')
                    if not has_file:
                        return f"Video section '{section_key}' is enabled but has no file or URL configured"
                else:
                    if not section.get('file_path'):
                        return f"{section_type.title()} section '{section_key}' is enabled but has no file configured"
    
    return None  

@app.route('/get-survey-config', methods=['GET'])
def get_survey_config():
    """Get current survey configuration"""
    try:
        survey_config_path = os.path.join(ensure_data_directory(), 'survey_config.json')
        with open(survey_config_path, 'r') as f:
            config = json.load(f)
        return jsonify(config)
    except FileNotFoundError:
        return jsonify(None)
    except Exception as e:
        app.logger.error(f"Error loading survey config: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/reset-survey-config', methods=['POST'])
def reset_survey_config():
    """Reset survey to default configuration"""
    try:
        survey_config_path = os.path.join(ensure_data_directory(), 'survey_config.json')
        if os.path.exists(survey_config_path):
            os.remove(survey_config_path)
        
        upload_dir = 'static/uploads'
        if os.path.exists(upload_dir):
            for filename in os.listdir(upload_dir):
                if filename.startswith(('information_form', 'consent_form', 'survey_image_', 'survey_video_', 'survey_pdf_')):
                    filepath = os.path.join(upload_dir, filename)
                    if os.path.exists(filepath):
                        os.remove(filepath)
        
        return jsonify({'success': True, 'message': 'Survey configuration reset to default'})
    except Exception as e:
        app.logger.error(f"Error resetting survey config: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# Survey media upload handling all done here
@app.route('/upload-survey-media', methods=['POST'])
def upload_survey_media():
    """Handle file uploads for survey media sections"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        media_type = request.form.get('media_type') 
        section_id = request.form.get('section_id')
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        if not media_type or not section_id:
            return jsonify({'success': False, 'error': 'Missing media_type or section_id'}), 400
        
        allowed_extensions = {
            'image': {'.jpg', '.jpeg', '.png', '.gif', '.webp'},
            'video': {'.mp4', '.webm', '.ogg', '.avi', '.mov'},
            'pdf': {'.pdf'}
        }
        
        file_ext = os.path.splitext(file.filename.lower())[1]
        if file_ext not in allowed_extensions.get(media_type, set()):
            return jsonify({'success': False, 'error': f'Invalid file type for {media_type}'}), 400
        
        upload_dir = 'static/uploads'
        os.makedirs(upload_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_filename = f"survey_{media_type}_{section_id}_{timestamp}{file_ext}"
        filepath = os.path.join(upload_dir, safe_filename)
        
        file.save(filepath)
        
        relative_path = f"/static/uploads/{safe_filename}"
        
        return jsonify({
            'success': True,
            'file_path': relative_path,
            'filename': safe_filename,
            'original_name': file.filename,
            'file_size': os.path.getsize(filepath)
        })
        
    except Exception as e:
        app.logger.error(f"Error uploading survey media: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/survey-system-status', methods=['GET'])
def survey_system_status():
    """Get status of survey system for debugging"""
    try:
        data_dir = ensure_data_directory()
        survey_config_path = os.path.join(data_dir, 'survey_config.json')
        
        status = {
            'has_custom_config': os.path.exists(survey_config_path),
            'config_readable': False,
            'uploaded_files': {},
            'static_template_exists': os.path.exists('templates/pre_survey.html'),
            'survey_js_exists': os.path.exists('static/js/pre_survey.js')
        }
        
        if status['has_custom_config']:
            try:
                with open(survey_config_path, 'r') as f:
                    config = json.load(f)
                status['config_readable'] = True
                status['config_sections'] = list(config.get('sections', {}).keys())
            except Exception:
                status['config_readable'] = False
        
        upload_dir = 'static/uploads'
        if os.path.exists(upload_dir):
            for filename in ['information_form.pdf', 'consent_form.pdf']:
                filepath = os.path.join(upload_dir, filename)
                status['uploaded_files'][filename] = os.path.exists(filepath)
        
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# This is just functionality for the researcher dashboard when creating survey previews
@app.route('/preview-survey', methods=['POST'])
def preview_survey():
    """Generate survey preview HTML"""
    try:
        config = request.json
        html = generate_survey_html_content(config, preview=True)
        return html, 200, {'Content-Type': 'text/html'}
    except Exception as e:
        return f"Error generating preview: {str(e)}", 500

@app.route('/download-form-file/<file_type>')
def download_form_file(file_type):
    """Download uploaded form files"""
    try:
        valid_types = ['information', 'consent', 'post_information', 'post_consent']
        if file_type not in valid_types:
            abort(404)
        
        filename = f"{file_type}_form.pdf"
        filepath = os.path.join('static', 'uploads', filename)
        
        if not os.path.exists(filepath):
            if request.headers.get('Content-Type') == 'application/json' or 'json' in request.headers.get('Accept', ''):
                return jsonify({'error': 'File not found'}), 404
            abort(404)
        
        return send_file(filepath, as_attachment=True, download_name=f"{file_type}_form.pdf")
    except Exception as e:
        if "404" not in str(e):
            app.logger.error(f"Error downloading form file: {e}")
        abort(404)

@app.route('/upload-form-file', methods=['POST'])
def upload_form_file():
    """Upload information sheet or consent form files"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        file_type = request.form.get('type')
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        valid_types = ['information', 'consent', 'post_information', 'post_consent']
        if not file_type or file_type not in valid_types:
            return jsonify({'success': False, 'error': 'Invalid file type'}), 400
        
        if not (file and file.filename.lower().endswith('.pdf') and 
                file.content_type == 'application/pdf'):
            return jsonify({'success': False, 'error': 'Only PDF files are allowed'}), 400
        
        file.seek(0, 2) 
        file_size = file.tell()
        file.seek(0) 
        
        if file_size > 10 * 1024 * 1024:  # can delete this file size limit if you want to?
            return jsonify({'success': False, 'error': 'File size too large (max 10MB)'}), 400
        
        upload_dir = 'static/uploads'
        os.makedirs(upload_dir, exist_ok=True)
        
        filename = f"{file_type}_form.pdf"
        filepath = os.path.join(upload_dir, filename)
        
        file.save(filepath)
        
        if not os.path.exists(filepath):
            return jsonify({'success': False, 'error': 'File upload failed'}), 500
        
        return jsonify({'success': True, 'filename': filename})
            
    except Exception as e:
        app.logger.error(f"Error uploading form file: {e}")
        return jsonify({'success': False, 'error': 'File upload failed'}), 500

# Post-Survey Config routes
@app.route('/preview-post-survey', methods=['POST'])
def preview_post_survey():
    """Generate post-survey preview HTML"""
    try:
        config = request.json
        html = generate_post_survey_html_content(config, 
                                                '#', '#', 
                                                'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx',
                                                'Finish', preview=True)
        return html, 200, {'Content-Type': 'text/html'}
    except Exception as e:
        return f"Error generating post-survey preview: {str(e)}", 500


@app.route('/preview-post-survey-2', methods=['POST'])
def preview_post_survey_2():
    """Generate post-survey 2 preview HTML"""
    try:
        config = request.json
        html = generate_post_survey_html_content(
            config,
            '#', '#',
            'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx',
            'Finish',
            preview=True,
            submit_endpoint='#'
        )
        return html, 200, {'Content-Type': 'text/html'}
    except Exception as e:
        return f"Error generating post-survey 2 preview: {str(e)}", 500

@app.route('/update-post-survey-enabled', methods=['POST'])
def update_post_survey_enabled():
    """Update the enabled state of the post-survey"""
    try:
        data = request.json
        enabled = data.get('enabled', False)
        
        current_settings = get_url_settings_from_db()
        current_settings['use_post_survey'] = 'true' if enabled else 'false'
        
        save_url_settings_to_db(current_settings)
        
        return jsonify({'success': True, 'enabled': enabled, 'message': 'Post-survey enabled state updated successfully'})
    except Exception as e:
        app.logger.error(f"Error updating post-survey enabled state: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def generate_survey_html(config):
    """Generate pre_survey.html file based on configuration"""
    try:
        html_content = generate_survey_html_content(config)
        
        with open('templates/pre_survey.html', 'w') as f:
            f.write(html_content)
            
    except Exception as e:
        app.logger.error(f"Error generating survey HTML: {e}")
        raise

def generate_survey_html_content(config, preview=False):
    """Generate the actual HTML content for the survey"""
    # This is a big function to generate the HTML for those surveys
    # it is based on the survey_config.json created before
    
    info_file_exists = os.path.exists('static/uploads/information_form.pdf')
    consent_file_exists = os.path.exists('static/uploads/consent_form.pdf')
    
    download_links = ""
    if info_file_exists or consent_file_exists:
        download_links = '<div class="form-downloads">'
        if info_file_exists:
            if preview:
                download_links += '<a href="#" class="download-link">Download Information Sheet</a>'
            else:
                download_links += '<a href="/download-form-file/information" class="download-link">Download Information Sheet</a>'
        if consent_file_exists:
            if preview:
                download_links += '<a href="#" class="download-link">Download Consent Form</a>'
            else:
                download_links += '<a href="/download-form-file/consent" class="download-link">Download Consent Form</a>'
        download_links += '</div>'
    
    if preview:
        css_link = '/static/css/styles.css'
        js_link = '/static/js/pre_survey.js'
        quit_link_var = 'window.quitRedirectionLink = "#";'
    else:
        css_link = '/static/css/styles.css'
        js_link = '/static/js/pre_survey.js'
        quit_link_var = f'window.quitRedirectionLink = "{os.environ.get("QUIT_URL", "https://www.prolific.com/")}";'
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{config.get('title', 'Survey Form')}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="{css_link}">
</head>
<body class="survey-page">
    <!-- Survey Consent Popup -->
    <div id="consent-popup" class="survey-consent-popup">
        <div class="survey-popup-content">
            <h2>{config.get('information', {}).get('title', 'Information and Consent Form')}</h2>
            <div class="consent-content">
                {format_consent_content(config.get('information', {}).get('content', ''))}
                {format_consent_content(config.get('consent', {}).get('content', ''))}
            </div>
            
            {download_links}
            
            <button id="consent-agree-btn" class="survey-btn survey-btn-agree">Agree</button>
            <button id="consent-quit-btn" class="survey-btn survey-btn-quit">Quit</button>
        </div>
    </div>

    <!-- Survey Quit Confirmation Popup -->
    <div id="quit-confirm-popup" class="survey-quit-confirm-popup survey-hidden">
        <div class="survey-popup-content">
            <h3>Are you sure you want to quit participation in this study?</h3>
            <button id="quit-confirm-yes-btn" class="survey-btn survey-btn-quit">Yes, Quit</button>
            <button id="quit-confirm-no-btn" class="survey-btn survey-btn-cancel">No, Go Back</button>
        </div>
    </div>

    <div class="survey-container">
        <div class="survey-header">
            <h1>{config.get('title', 'Survey Form')}</h1>
        </div>
        
        <div class="survey-content">
            <form id="survey-form">
'''
    # adding sections here
    sections = config.get('sections', {})
    settings = config.get('settings', {})
    randomize_items = settings.get('randomizeItems', False)
    
    for section_id, section_config in sections.items():
        if not section_config.get('enabled', False):
            continue
            
        section_type = section_config.get('type', section_id.split('-')[0])
        
        if section_type == 'demographics':
            html += generate_demographics_section(section_config)
        elif section_type == 'likert':
            html += generate_likert_section(section_config, randomize_items)
        elif section_type == 'freetext':
            html += generate_freetext_section(section_config, randomize_items)
        elif section_type == 'checkbox':
            html += generate_checkbox_section(section_config, section_id)
        elif section_type == 'dropdown':
            html += generate_dropdown_section(section_config, section_id)
        elif section_type == 'slider':
            html += generate_slider_section(section_config, section_id)
        elif section_type == 'image':
            html += generate_image_section(section_config, section_id)
        elif section_type == 'video':
            html += generate_video_section(section_config, section_id)
        elif section_type == 'pdf':
            html += generate_pdf_section(section_config, section_id)
        elif section_type == 'custom':
            html += generate_custom_section(section_config)
    
    html += '''
                <div class="submit-section">
                    <button type="submit" id="submit-btn">Submit Survey</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Survey Submission Modal -->
    <div id="submission-modal" class="survey-submission-modal survey-hidden">
        <div class="survey-popup-content">
            <div class="submission-content">
                <div class="submission-spinner"></div>
                <h3 id="submission-message">Survey submitted successfully!</h3>
                <p id="submission-detail">You will now be connected to the AI system.</p>
            </div>
        </div>
    </div>

    <script>
        // Make quit redirection link available to external JS
        ''' + quit_link_var + '''
    </script>
    <script src="''' + js_link + '''"></script>
</body>
</html>'''
    
    return html

def generate_post_survey_html_content(config, quit_redirection_link, finish_redirection_link, completion_instructions, finish_button_text, preview=False, submit_endpoint='/post-survey'):
    """Generate the actual HTML content for the post-interaction survey"""
    
    info_file_exists = os.path.exists('static/uploads/post_information_form.pdf')
    consent_file_exists = os.path.exists('static/uploads/post_consent_form.pdf')
    
    download_links = ""
    if info_file_exists or consent_file_exists:
        download_links = '<div class="form-downloads">'
        if info_file_exists:
            if preview:
                download_links += '<a href="#" class="download-link">Download Information Sheet</a>'
            else:
                download_links += '<a href="/download-form-file/post_information" class="download-link">Download Information Sheet</a>'
        if consent_file_exists:
            if preview:
                download_links += '<a href="#" class="download-link">Download Consent Form</a>'
            else:
                download_links += '<a href="/download-form-file/post_consent" class="download-link">Download Consent Form</a>'
        download_links += '</div>'
    
    if preview:
        css_link = '/static/css/styles.css'
        js_link = '/static/js/post_survey.js'
        quit_link_var = 'window.quitRedirectionLink = "#";'
        finish_link_var = 'window.finishRedirectionLink = "#";'
        submit_endpoint_var = 'window.postSurveyEndpoint = "#";'
    else:
        css_link = '/static/css/styles.css'
        js_link = '/static/js/post_survey.js'
        quit_link_var = f'window.quitRedirectionLink = "{quit_redirection_link}";'
        finish_link_var = f'window.finishRedirectionLink = "{finish_redirection_link}";'
        submit_endpoint_var = f'window.postSurveyEndpoint = "{submit_endpoint}";'
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{config.get('title', 'Survey Form')}</title>
    <link rel="icon" type="image/x-icon" href="/static/images/IA.ico">
    <link rel="stylesheet" href="{css_link}" charset="UTF-8">
</head>
<body class="survey-page">
    <div class="survey-container">
        <div class="survey-header">
            <h1>{config.get('title', 'Survey Form')}</h1>
        </div>
        
        <div class="survey-content">
            <!-- Main Survey Form --> 
            <form id="survey-form" class="survey-form">
                <div id="survey-sections" class="survey-sections">
'''
    # adding sections here
    sections = config.get('sections', {})
    settings = config.get('settings', {})
    randomize_items = settings.get('randomizeItems', False)
    
    for section_id, section_config in sections.items():
        if not section_config.get('enabled', False):
            continue
            
        section_type = section_config.get('type', section_id.split('-')[0])
        
        if section_type == 'demographics':
            html += generate_demographics_section(section_config)
        elif section_type == 'likert':
            html += generate_likert_section(section_config, randomize_items)
        elif section_type == 'freetext':
            html += generate_freetext_section(section_config, randomize_items)
        elif section_type == 'checkbox':
            html += generate_checkbox_section(section_config, section_id)
        elif section_type == 'dropdown':
            html += generate_dropdown_section(section_config, section_id)
        elif section_type == 'slider':
            html += generate_slider_section(section_config, section_id)
        elif section_type == 'image':
            html += generate_image_section(section_config, section_id)
        elif section_type == 'video':
            html += generate_video_section(section_config, section_id)
        elif section_type == 'pdf':
            html += generate_pdf_section(section_config, section_id)
        elif section_type == 'custom':
            html += generate_custom_section(section_config)
    
    html += '''
                </div>
                <div class="survey-navigation">
                    <button type="submit" id="submit-btn">Submit Survey</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Survey Submission Modal -->
    <div id="submission-modal" class="survey-submission-modal survey-hidden">
        <div class="survey-popup-content">
            <div class="submission-content">
                <div class="submission-spinner"></div>
                <h3 id="submission-message">Survey submitted successfully!</h3>
                <p id="submission-detail">Processing your responses...</p>
            </div>
        </div>
    </div>

    <!-- Final Completion Modal -->
    <div id="completion-modal" class="survey-submission-modal survey-hidden">
        <div class="survey-popup-content">
            <div class="completion-content">
                <h3>Study Complete</h3>
                <div id="completion-instructions">
                    <p>''' + completion_instructions + '''</p>
                </div>
                <button id="final-finish-btn" class="survey-consent-button agree">''' + finish_button_text + '''</button>
            </div>
        </div>
    </div>

    <script>
        // Make redirection links available to external JS
        ''' + finish_link_var + '''
        ''' + submit_endpoint_var + '''
        window.completionInstructions = "''' + completion_instructions.replace('"', '\\"') + '''";
        window.finishButtonText = "''' + finish_button_text + '''";
    </script>
    <script src="''' + js_link + '''"></script>
</body>
</html>'''
    
    return html

def format_consent_content(content):
    """Format consent content with proper HTML"""
    if not content:
        return "<p>Please read the information about this study.</p>"
    
    lines = content.split('\n')
    formatted_lines = []
    
    for line in lines:
        line = line.strip()
        if line:
            if line.startswith('•') or line.startswith('-'):
                if not formatted_lines or not formatted_lines[-1].startswith('<ul>'):
                    formatted_lines.append('<ul>')
                formatted_lines.append(f'<li>{line[1:].strip()}</li>')
            else:
                if formatted_lines and formatted_lines[-1] == '<ul>':
                    formatted_lines.append('</ul>')
                formatted_lines.append(f'<p>{line}</p>')
    
    if formatted_lines and formatted_lines[-1] == '<ul>':
        formatted_lines.append('</ul>')
    
    return '\n'.join(formatted_lines)

def generate_demographics_section(config):
    """Generate demographics section HTML"""
    html = f'''
        <!-- Demographics Section -->
        <div class="survey-section" id="demographics-section">
            <div class="survey-section-title">{config.get('title', 'Demographics')}</div>
'''
    
    fields = config.get('fields', {})
    
    if fields.get('age', {}).get('enabled', False):
        age_config = fields['age']
        html += f'''
            <label for="demographics-age">Age:</label>
            <input type="number" id="demographics-age" name="age" min="{age_config.get('min', 18)}" max="{age_config.get('max', 99)}" required><br><br>
'''
    
    if fields.get('gender', {}).get('enabled', False):
        gender_config = fields['gender']
        html += '''
            <label for="demographics-gender">Gender:</label>
            <select id="demographics-gender" name="gender" required>
                <option value="">Select...</option>
'''
        for option in gender_config.get('options', ['Female', 'Male', 'Other', 'Prefer not to say']):
            html += f'                <option value="{option.lower().replace(" ", "_")}">{option}</option>\n'
        
        html += '            </select><br><br>\n'
    
    html += '        </div>\n'
    return html

def generate_likert_section(config, randomize_items=False):
    """Generate Likert scale section HTML"""
    html = f'''
        <!-- Likert Scale Section -->
        <div class="survey-section" id="likert-scale-section">
            <div class="survey-section-title">{config.get('title', 'Likert Scale Items')}</div>
            <table class="survey-likert-table">
                <tr>
                    <th>Statement</th>
'''
    
    scale_labels = config.get('scaleLabels', 'Strongly Disagree,Disagree,Neutral,Agree,Strongly Agree').split(',')
    for label in scale_labels:
        html += f'                    <th>{label.strip()}</th>\n'
    
    html += '                </tr>\n'
    
    raw_items = config.get('items', [])
    items = []
    for i, item in enumerate(raw_items):
        if isinstance(item, dict):
            statement = item.get('statement') or item.get('text') or item.get('item') or ''
            item_id = item.get('id', i)
        else:
            statement = str(item)
            item_id = i
        items.append({'id': item_id, 'statement': statement})

    if randomize_items and items:
        items = items.copy()
        random.shuffle(items)

    for item in items:
        html += f'''                <tr>
                    <td>{item.get('statement', '')}</td>
'''
        item_name = f"likert_item_{item.get('id')}"
        for j, _ in enumerate(scale_labels):
            required = 'required' if j == 0 else ''
            html += f'                    <td><input type="radio" name="{item_name}" value="{j+1}" {required}></td>\n'
        html += '                </tr>\n'
    
    html += '''            </table>
        </div>
    '''
    return html

def generate_freetext_section(config, randomize_items=False):
    """Generate free text section HTML"""
    html = f'''
        <!-- Free Form Text Section -->
        <div class="survey-section" id="free-form-text-section">
            <div class="survey-section-title">{config.get('title', 'Free Form Text')}</div>
'''
    
    questions = config.get('questions', [])
    if randomize_items and questions:
        questions = questions.copy() 
        random.shuffle(questions)
    
    for i, question_config in enumerate(questions):
        if isinstance(question_config, dict):
            question = question_config.get('question', '')
            rows = question_config.get('rows', 4)
            q_id = question_config.get('id', i)
        else:
            question = str(question_config)
            rows = 4
            q_id = i

        field_id = f"free-text-response-{q_id}"

        html += f'''            <label for="{field_id}">{question}</label><br>
            <textarea id="{field_id}" name="free_text_response_{q_id}" rows="{rows}" cols="50" required></textarea><br><br>
'''
    
    html += '        </div>\n'
    return html

def generate_custom_section(config):
    """Generate custom section HTML"""
    html = f'''
        <!-- Custom Section -->
        <div class="survey-section" id="custom-section">
            <div class="survey-section-title">{config.get('title', 'Custom Section')}</div>
'''
    
    description = config.get('description', '')
    if description:
        html += f'            <div class="survey-section-description">{description}</div>\n'
    
    fields = config.get('fields', [])
    for i, field_config in enumerate(fields):
        field_id = f"custom-field-{i}"
        field_label = field_config.get('label', f'Field {i+1}')
        field_type = field_config.get('type', 'text')
        field_options = field_config.get('options', '')
        field_required = field_config.get('required', False)
        required_attr = 'required' if field_required else ''
        
        html += f'            <label for="{field_id}">{field_label}</label><br>\n'
        
        if field_type == 'textarea':
            html += f'            <textarea id="{field_id}" name="{field_id}" rows="4" {required_attr}></textarea><br><br>\n'
        elif field_type == 'select':
            html += f'            <select id="{field_id}" name="{field_id}" {required_attr}>\n'
            for option in field_options.split(','):
                option = option.strip()
                if option:
                    html += f'                <option value="{option}">{option}</option>\n'
            html += '            </select><br><br>\n'
        elif field_type == 'radio':
            for j, option in enumerate(field_options.split(',')):
                option = option.strip()
                if option:
                    radio_id = f"{field_id}-{j}"
                    html += f'            <input type="radio" id="{radio_id}" name="{field_id}" value="{option}" {required_attr}>\n'
                    html += f'            <label for="{radio_id}">{option}</label><br>\n'
            html += '<br>\n'
        elif field_type == 'checkbox':
            for j, option in enumerate(field_options.split(',')):
                option = option.strip()
                if option:
                    checkbox_id = f"{field_id}-{j}"
                    html += f'            <input type="checkbox" id="{checkbox_id}" name="{field_id}[]" value="{option}">\n'
                    html += f'            <label for="{checkbox_id}">{option}</label><br>\n'
            html += '<br>\n'
        else:
            html += f'            <input type="{field_type}" id="{field_id}" name="{field_id}" {required_attr}><br><br>\n'
    
    html += '        </div>\n'
    return html

def generate_checkbox_section(config, section_id):
    """Generate checkbox section HTML"""
    section_id = section_id.replace('-', '_')
    title = config.get('title', 'Multiple Choice Selection')
    question = config.get('question', 'Please select all that apply:')
    options = config.get('options', [])
    
    html = f'''
        <!-- Checkbox Section -->
        <div class="survey-section" id="{section_id}">
            <div class="survey-section-title">{title}</div>
            <div class="survey-section-description">{question}</div>
'''
    
    for i, option in enumerate(options):
        checkbox_id = f"{section_id}_option_{i}"
        html += f'''            <input type="checkbox" id="{checkbox_id}" name="{section_id}_response[]" value="{option}">
            <label for="{checkbox_id}">{option}</label><br>
'''
    
    html += '        </div>\n'
    return html

def generate_dropdown_section(config, section_id):
    """Generate dropdown section HTML"""
    section_id = section_id.replace('-', '_')
    title = config.get('title', 'Selection')
    question = config.get('question', 'Please select an option:')
    options = config.get('options', [])
    required = config.get('required', False)
    required_attr = 'required' if required else ''
    
    html = f'''
        <!-- Dropdown Section -->
        <div class="survey-section" id="{section_id}">
            <div class="survey-section-title">{title}</div>
            <label for="{section_id}_select">{question}</label><br>
            <select id="{section_id}_select" name="{section_id}_response" {required_attr}>
                <option value="">Select an option...</option>
'''
    
    for option in options:
        html += f'                <option value="{option}">{option}</option>\n'
    
    html += '''            </select><br><br>
        </div>
'''
    return html

def generate_slider_section(config, section_id):
    """Generate slider section HTML"""
    section_id = section_id.replace('-', '_')
    title = config.get('title', 'Rating Scale')
    question = config.get('question', 'Please rate using the slider:')
    slider_type = config.get('slider_type', 'labels') 
    required = config.get('required', False)
    required_attr = 'required' if required else ''
    
    html = f'''
        <!-- Slider Section -->
        <div class="survey-section" id="{section_id}">
            <div class="survey-section-title">{title}</div>
            <label for="{section_id}_slider">{question}</label><br>
            <div class="slider-container">
'''
    
    if slider_type == 'numeric':
        min_val = config.get('min_value', 0)
        max_val = config.get('max_value', 100)
        default_val = config.get('default_value', int((min_val + max_val) / 2))
        
        html += f'''                <div class="slider-labels">
                    <span class="slider-min">{min_val}</span>
                    <span class="slider-max">{max_val}</span>
                </div>
                <input type="range" id="{section_id}_slider" name="{section_id}_response" 
                       min="{min_val}" max="{max_val}" value="{default_val}" 
                       class="survey-slider" {required_attr} data-slider-interacted="false">
                <div class="slider-value-display">
                    <span id="{section_id}_value">{default_val}</span>
                </div>
                <script>
                    document.getElementById('{section_id}_slider').oninput = function() {{
                        document.getElementById('{section_id}_value').textContent = this.value;
                        this.setAttribute('data-slider-interacted', 'true');
                        updateNextButton();
                    }}
                </script>
'''
    else:
        left_label = config.get('left_label', 'Strongly Disagree')
        right_label = config.get('right_label', 'Strongly Agree')
        steps = config.get('steps', 7)
        default_val = config.get('default_value', int(steps / 2))
        
        html += f'''                <div class="slider-labels">
                    <span class="slider-min">{left_label}</span>
                    <span class="slider-max">{right_label}</span>
                </div>
                <input type="range" id="{section_id}_slider" name="{section_id}_response" 
                       min="1" max="{steps}" value="{default_val}" 
                       class="survey-slider" {required_attr} data-slider-interacted="false">
                <div class="slider-value-display">
                    <span id="{section_id}_value">{default_val}</span>
                </div>
                <script>
                    document.getElementById('{section_id}_slider').oninput = function() {{
                        document.getElementById('{section_id}_value').textContent = this.value;
                        this.setAttribute('data-slider-interacted', 'true');
                        updateNextButton();
                    }}
                </script>
'''
    
    html += '''            </div>
        </div>
'''
    return html

def generate_image_section(config, section_id):
    """Generate image display section HTML"""
    title = config.get('title', 'Image Display')
    description = config.get('description', '')
    file_path = config.get('file_path', '')
    alt_text = config.get('alt_text', 'Image')
    display_size = config.get('display_size', 'medium')
    alignment = config.get('alignment', 'center')
    require_response = config.get('require_response', False)
    
    size_class = {
        'small': 'image-small',
        'medium': 'image-medium', 
        'large': 'image-large',
        'full': 'image-full'
    }.get(display_size, 'image-medium')
    
    html = f'''
        <!-- Image Section -->
        <div class="survey-section" id="{section_id}-section">
            <div class="survey-section-title">{title}</div>
'''
    
    if description:
        html += f'            <div class="section-description">{description}</div>\n'
    
    if file_path:
        html += f'''            <div class="image-display {alignment}">
                <img src="{file_path}" alt="{alt_text}" class="{size_class}">
            </div>
'''
    else:
        html += '            <div class="image-placeholder">Image will be displayed here</div>\n'
    
    if require_response:
        response_type = config.get('response_type', 'rating')
        
        if response_type == 'rating':
            question = config.get('rating_question', 'How would you rate this image?')
            scale = config.get('rating_scale', 10)
            html += f'''            <div class="response-section">
                <label for="{section_id}_rating">{question}</label>
                <select id="{section_id}_rating" name="{section_id}_rating" required>
                    <option value="">Select rating...</option>
'''
            for i in range(1, scale + 1):
                html += f'                    <option value="{i}">{i}</option>\n'
            html += '                </select>\n            </div>\n'
            
        elif response_type == 'text':
            question = config.get('text_question', 'What are your thoughts about this image?')
            rows = config.get('text_rows', 4)
            html += f'''            <div class="response-section">
                <label for="{section_id}_text">{question}</label>
                <textarea id="{section_id}_text" name="{section_id}_text" rows="{rows}" required></textarea>
            </div>
'''
        elif response_type == 'checkbox':
            question = config.get('checkbox_question', 'Select all that apply to this image:')
            options = config.get('checkbox_options', [])
            html += f'''            <div class="response-section">
                <label>{question}</label>
'''
            for i, option in enumerate(options):
                html += f'''                <div class="checkbox-option">
                    <input type="checkbox" id="{section_id}_checkbox_{i}" name="{section_id}_checkbox[]" value="{option}">
                    <label for="{section_id}_checkbox_{i}">{option}</label>
                </div>
'''
            html += '            </div>\n'
    
    html += '        </div>\n'
    return html

def generate_video_section(config, section_id):
    """Generate video display section HTML"""
    title = config.get('title', 'Video Display')
    description = config.get('description', '')
    file_path = config.get('file_path', '')
    video_url = config.get('video_url', '')
    video_size = config.get('video_size', 'medium')
    autoplay = config.get('autoplay', False)
    controls = config.get('controls', True)
    loop = config.get('loop', False)
    require_response = config.get('require_response', False)
    
    size_attrs = {
        'small': 'width="400" height="300"',
        'medium': 'width="640" height="480"',
        'large': 'width="800" height="600"',
        'responsive': 'width="100%" height="auto"'
    }.get(video_size, 'width="640" height="480"')
    
    html = f'''
        <!-- Video Section -->
        <div class="survey-section" id="{section_id}-section">
            <div class="survey-section-title">{title}</div>
'''
    
    if description:
        html += f'            <div class="section-description">{description}</div>\n'
    # this external video stuff needs to be fixed i think
    if video_url:
        if 'youtube.com' in video_url or 'youtu.be' in video_url:
            video_id = video_url.split('/')[-1].split('?')[0].replace('watch?v=', '')
            html += f'''            <div class="video-display">
                <iframe {size_attrs} src="https://www.youtube.com/embed/{video_id}" 
                        frameborder="0" allowfullscreen></iframe>
            </div>
'''
        elif 'vimeo.com' in video_url:
            video_id = video_url.split('/')[-1]
            html += f'''            <div class="video-display">
                <iframe {size_attrs} src="https://player.vimeo.com/video/{video_id}" 
                        frameborder="0" allowfullscreen></iframe>
            </div>
'''
        else:
            html += f'''            <div class="video-display">
                <video {size_attrs} {"controls" if controls else ""} {"autoplay" if autoplay else ""} {"loop" if loop else ""}>
                    <source src="{video_url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
'''
    elif file_path:
        html += f'''            <div class="video-display">
                <video {size_attrs} {"controls" if controls else ""} {"autoplay" if autoplay else ""} {"loop" if loop else ""}>
                    <source src="{file_path}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
'''
    else:
        html += '            <div class="video-placeholder">Video will be displayed here</div>\n'
    
    if require_response:
        response_type = config.get('response_type', 'rating')
        
        if response_type == 'rating':
            question = config.get('rating_question', 'How would you rate this video?')
            scale = config.get('rating_scale', 10)
            html += f'''            <div class="response-section">
                <label for="{section_id}_rating">{question}</label>
                <select id="{section_id}_rating" name="{section_id}_rating" required>
                    <option value="">Select rating...</option>
'''
            for i in range(1, scale + 1):
                html += f'                    <option value="{i}">{i}</option>\n'
            html += '                </select>\n            </div>\n'
            
        elif response_type == 'text':
            question = config.get('text_question', 'What are your thoughts about this video?')
            rows = config.get('text_rows', 4)
            html += f'''            <div class="response-section">
                <label for="{section_id}_text">{question}</label>
                <textarea id="{section_id}_text" name="{section_id}_text" rows="{rows}" required></textarea>
            </div>
'''
        elif response_type == 'checkbox':
            question = config.get('checkbox_question', 'Select all that apply to this video:')
            options = config.get('checkbox_options', [])
            html += f'''            <div class="response-section">
                <label>{question}</label>
'''
            for i, option in enumerate(options):
                html += f'''                <div class="checkbox-option">
                    <input type="checkbox" id="{section_id}_checkbox_{i}" name="{section_id}_checkbox[]" value="{option}">
                    <label for="{section_id}_checkbox_{i}">{option}</label>
                </div>
'''
            html += '            </div>\n'
    
    html += '        </div>\n'
    return html

def generate_pdf_section(config, section_id):
    """Generate PDF display section HTML"""
    title = config.get('title', 'PDF Display')
    description = config.get('description', '')
    file_path = config.get('file_path', '')
    display_height = config.get('display_height', '600')
    display_mode = config.get('display_mode', 'embed')
    allow_download = config.get('allow_download', True)
    require_view = config.get('require_view', False)
    require_response = config.get('require_response', False)
    
    html = f'''
        <!-- PDF Section -->
        <div class="survey-section" id="{section_id}-section">
            <div class="survey-section-title">{title}</div>
'''
    
    if description:
        html += f'            <div class="section-description">{description}</div>\n'
    
    if file_path:
        if display_mode in ['embed', 'both']:
            height_attr = f'height="{display_height}px"' if display_height != 'auto' else 'style="height: auto;"'
            html += f'''            <div class="pdf-display">
                <iframe src="{file_path}" width="100%" {height_attr} 
                        frameborder="0">
                    <p>Your browser does not support PDFs. 
                    <a href="{file_path}" target="_blank">Download the PDF</a>.</p>
                </iframe>
            </div>
'''
        
        if display_mode in ['link', 'both'] or allow_download:
            html += f'''            <div class="pdf-download">
                <a href="{file_path}" target="_blank" class="download-link">Download PDF</a>
            </div>
'''
    else:
        html += '            <div class="pdf-placeholder">PDF will be displayed here</div>\n'
    
    if require_response:
        response_type = config.get('response_type', 'confirmation')
        
        if response_type == 'confirmation':
            confirmation_text = config.get('confirmation_text', 'I have read and understood the document')
            html += f'''            <div class="response-section">
                <div class="checkbox-option">
                    <input type="checkbox" id="{section_id}_confirmation" name="{section_id}_response" value="confirmed" required>
                    <label for="{section_id}_confirmation">{confirmation_text}</label>
                </div>
            </div>
'''
        elif response_type == 'rating':
            question = config.get('rating_question', 'How would you rate this document?')
            scale = config.get('rating_scale', 10)
            html += f'''            <div class="response-section">
                <label for="{section_id}_rating">{question}</label>
                <select id="{section_id}_rating" name="{section_id}_rating" required>
                    <option value="">Select rating...</option>
'''
            for i in range(1, scale + 1):
                html += f'                    <option value="{i}">{i}</option>\n'
            html += '                </select>\n            </div>\n'
            
        elif response_type == 'text':
            question = config.get('text_question', 'What are your thoughts about this document?')
            rows = config.get('text_rows', 4)
            html += f'''            <div class="response-section">
                <label for="{section_id}_text">{question}</label>
                <textarea id="{section_id}_text" name="{section_id}_text" rows="{rows}" required></textarea>
            </div>
'''
        elif response_type == 'checkbox':
            question = config.get('checkbox_question', 'Select all that apply to this document:')
            options = config.get('checkbox_options', [])
            html += f'''            <div class="response-section">
                <label>{question}</label>
'''
            for i, option in enumerate(options):
                html += f'''                <div class="checkbox-option">
                    <input type="checkbox" id="{section_id}_checkbox_{i}" name="{section_id}_checkbox[]" value="{option}">
                    <label for="{section_id}_checkbox_{i}">{option}</label>
                </div>
'''
            html += '            </div>\n'
    
    html += '        </div>\n'
    return html

# Branding Configuration Routes
@app.route('/get-branding-settings', methods=['GET'])
def get_branding_settings():
    """Get current branding settings"""
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    #  all branding settings
    branding_keys = [
        'login_title', 'login_footer_line1', 'login_footer_line2', 'login_footer_line3',
        'chat_header_line1', 'chat_header_line2'
    ]
    
    settings = {}
    for key in branding_keys:
        c.execute('SELECT setting_value FROM url_settings WHERE setting_name = ?', (key,))
        result = c.fetchone()
        if result:
            settings[key] = result[0]
    
    conn.close()
    
    default_settings = {
        'login_title': 'Artificial Intelligence <br>Gateway',
        'login_footer_line1': 'chatPsych',
        'login_footer_line2': 'Powered by',
        'login_footer_line3': 'The Australian Institute for Machine Learning',
        'chat_header_line1': 'Australian Institute for Machine&nbsp;Learning',
        'chat_header_line2': 'chatPsych'
    }
    
    for key, default_value in default_settings.items():
        if key not in settings:
            settings[key] = default_value
    
    return jsonify(settings)

@app.route('/update-branding-settings', methods=['POST'])
def update_branding_settings():
    """Update branding settings"""
    data = request.json
    
    required_fields = [
        'login_title', 'login_footer_line1', 'login_footer_line2', 'login_footer_line3',
        'chat_header_line1', 'chat_header_line2'
    ]
    
    for field in required_fields:
        if field not in data or not data[field]:
            return jsonify({'error': f'{field} is required'}), 400
    
    try:
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        
        for field in required_fields:
            value = data[field].strip()
            c.execute('INSERT OR REPLACE INTO url_settings (setting_name, setting_value) VALUES (?, ?)', 
                      (field, value))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Branding settings updated successfully'})
    except Exception as e:
        app.logger.error(f"Error updating branding settings: {e}")
        return jsonify({'error': 'Error updating branding settings'}), 500

@app.route('/reset-branding-settings', methods=['POST'])
def reset_branding_settings():
    """Reset branding settings to defaults"""
    try:
        default_settings = {
            'login_title': 'Artificial Intelligence <br>Gateway',
            'login_footer_line1': 'chatPsych',
            'login_footer_line2': 'Powered by',
            'login_footer_line3': 'The Australian Institute for Machine Learning',
            'chat_header_line1': 'Australian Institute for Machine&nbsp;Learning',
            'chat_header_line2': 'chatPsych'
        }
        
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        
        for key, value in default_settings.items():
            c.execute('INSERT OR REPLACE INTO url_settings (setting_name, setting_value) VALUES (?, ?)', 
                      (key, value))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Branding settings reset to defaults'})
    except Exception as e:
        app.logger.error(f"Error resetting branding settings: {e}")
        return jsonify({'error': 'Error resetting branding settings'}), 500
    
##### if your name is Josh de Leeuw and you're reading this--hi, I'm honoured you're looking at the codebase!

if __name__ == '__main__':
    print("Starting chatPsych...")
    print("Validating environment variables...")
    
    if not validate_env_variables():
        print("Environment validation failed. Please check your .env file.")
        print("Required variables: FLASK_SECRET_KEY, researcher_username, researcher_password")
    else:
        print("Environment validated successfully.")
        print(f"Researcher username: {os.environ.get('researcher_username')}")
    
    init_db()
    init_default_url_settings()  
    init_default_branding_settings() 
    
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Flask app on port {port}")
    app.run(debug=True, host='0.0.0.0', port=port)