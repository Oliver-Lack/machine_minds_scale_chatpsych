# This is the API script to AI model providers. It uses the LiteLLM library to unify handling.

import os
import json
import warnings
import litellm
from litellm import completion
from pathlib import Path

# Validate critical environment variables
required_keys = ['FLASK_SECRET_KEY']
missing_keys = [key for key in required_keys if not os.getenv(key)]
if missing_keys:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_keys)}")

api_keys = [
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'GEMINI_API_KEY',
    'GROQ_API_KEY', 'PERPLEXITY_API_KEY', 'MISTRAL_API_KEY',
    'COHERE_API_KEY', 'AI21_API_KEY', 'TOGETHER_API_KEY', 'FIREWORKS_API_KEY', 
    'REPLICATE_API_TOKEN', 'CEREBRAS_API_KEY', 'DEEPSEEK_API_KEY',
    'AZURE_OPENAI_API_KEY', 'HUGGINGFACE_API_KEY', 'NVIDIA_NIM_API_KEY', 'OPENROUTER_API_KEY'
]
missing_api_keys = [key for key in api_keys if not os.getenv(key)]
available_api_keys = [key for key in api_keys if os.getenv(key)]

# Only show API key info if there are any missing keys or if all primary providers aren't available
primary_keys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY']
missing_primary = [key for key in primary_keys if not os.getenv(key)]
available_primary = [key for key in primary_keys if os.getenv(key)]

# Check for the research dashboard credentials
researcher_username_set = bool(os.getenv('researcher_username'))
researcher_password_set = bool(os.getenv('researcher_password'))
flask_secret_set = bool(os.getenv('FLASK_SECRET_KEY'))

# Only show startup status once (avoid repetition in multi-worker setups)
import multiprocessing
if not hasattr(multiprocessing.current_process(), '_startup_logged'):
    multiprocessing.current_process()._startup_logged = True
    
    print(f"AI System Ready: {len(available_api_keys)}/{len(api_keys)} providers configured")
    print(f"Primary providers: {', '.join([key.replace('_API_KEY', '') for key in available_primary])} ({len(available_primary)}/4)")
    print(f"Research dashboard: {'Enabled' if (researcher_username_set and researcher_password_set and flask_secret_set) else 'Missing credentials'}")

    # Show missing keys if any
    if missing_api_keys:
        missing_names = [key.replace('_API_KEY', '').replace('_API_TOKEN', '') for key in missing_api_keys]
        print(f"ℹ Missing optional providers: {missing_names}")

    # Only show warnings for critical issues
    if len(missing_primary) == len(primary_keys):
        print("⚠ Warning: No primary AI providers found. Add at least one:")
        print("  - Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or XAI_API_KEY in your .env file")
    elif not (researcher_username_set and researcher_password_set):
        print("⚠ Warning: Research dashboard credentials incomplete. Set researcher_username and researcher_password in .env")

# This hides some technical warning messages
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

def load_agent(filepath):
    """Load an agent JSON config.
    If the file is missing/invalid, falls back to a sensible existing agent or a minimal built-in config.
    """

    def _log_once(message: str):
        # Avoid noisy duplicate logs in multi-worker setups (e.g., gunicorn).
        import multiprocessing
        proc = multiprocessing.current_process()
        if getattr(proc, "_agent_loader_logged", False):
            return
        proc._agent_loader_logged = True
        print(message)

    def _is_default_agent_path(path: Path) -> bool:
        # Treat missing default.json as a normal deployment state.
        # Compare on normalized path parts to handle absolute/relative differences.
        parts = [p.lower() for p in path.parts]
        return len(parts) >= 2 and parts[-2] == "agents" and parts[-1] == "default.json"

    def _resolve_path(path_like) -> Path:
        path_obj = Path(path_like) if not isinstance(path_like, Path) else path_like
        if path_obj.is_absolute():
            return path_obj
        return Path(__file__).resolve().parent / path_obj

    def _built_in_default_agent() -> dict:
        # Keep this minimal and conservative: do not enable injectors by default.
        return {
            "filename": "built_in_default",
            "PrePrompt": "",
            "model": "gpt-4o",
            "temperature": 1,
            "top_p": 1,
            "presence_penalty": 0,
            "frequency_penalty": 0,
            "max_completion_tokens": 300,
            "objection_injector": False,
            "objection_injector_prompt": "",
            "autonomy_injector": False,
            "reasoning_effort": None,
        }

    def _load_json_file(path: Path):
        with path.open('r', encoding='utf-8') as file:
            return json.load(file)

    requested_path = _resolve_path(filepath)

    try:
        return _load_json_file(requested_path)
    except FileNotFoundError:
        # Most deployments start with no agents configured.
        if _is_default_agent_path(requested_path):
            return _built_in_default_agent()

        _log_once(
            f"Warning: Agent config not found: {requested_path}. "
            "Using built-in defaults."
        )
        return _built_in_default_agent()
    except json.JSONDecodeError as e:
        _log_once(
            f"Warning: Agent config JSON invalid: {requested_path} ({e}). "
            "Using built-in defaults."
        )
        return _built_in_default_agent()
    except Exception as e:
        _log_once(
            f"Warning: Could not load agent config: {requested_path} ({e}). "
            "Using built-in defaults."
        )
        return _built_in_default_agent()

# Common names for AI models that users will see in the interface
MODEL_DISPLAY_NAMES = {
    # Custom Model
    "custom": "Custom Model (Enter model name manually)",
    
    # OpenAI - GPT-5 Series (Latest)
    "gpt-5.2": "GPT-5.2 (Latest)",
    "gpt-5.2-2025-12-11": "GPT-5.2 (Dec 2025)",
    "gpt-5.2-pro": "GPT-5.2 Pro",
    "gpt-5.2-pro-2025-12-11": "GPT-5.2 Pro (Dec 2025)",
    "gpt-5.2-chat-latest": "GPT-5.2 Chat (Latest)",
    "gpt-5.2-codex": "GPT-5.2 Codex (Agentic Coding)",
    "gpt-5.3-codex": "GPT-5.3 Codex (Most Capable)",
    
    # OpenAI - GPT-5.1 Series
    "gpt-5.1": "GPT-5.1",
    "gpt-5.1-chat-latest": "GPT-5.1 Chat (Latest)",
    "gpt-5.1-codex": "GPT-5.1 Codex",
    "gpt-5.1-codex-mini": "GPT-5.1 Codex Mini",
    "gpt-5.1-codex-max": "GPT-5.1 Codex Max (Long-running)",
    
    # OpenAI - GPT-5 Series
    "gpt-5": "GPT-5",
    "gpt-5-2025-08-07": "GPT-5 (Aug 2025)",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5-mini-2025-08-07": "GPT-5 Mini (Aug 2025)",
    "gpt-5-nano": "GPT-5 Nano",
    "gpt-5-nano-2025-08-07": "GPT-5 Nano (Aug 2025)",
    "gpt-5-pro": "GPT-5 Pro",
    "gpt-5-chat-latest": "GPT-5 Chat (Latest)",
    "gpt-5-codex": "GPT-5 Codex",
    
    # OpenAI - GPT-4 Series
    "gpt-4o": "GPT-4o",
    "gpt-4o-2024-08-06": "GPT-4o (Aug 2024)",
    "gpt-4o-2024-05-13": "GPT-4o (May 2024)",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4o-mini-2024-07-18": "GPT-4o Mini (Jul 2024)",
    "gpt-4.1": "GPT-4.1 (2025)",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1-nano": "GPT-4.1 Nano",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-4-turbo-preview": "GPT-4 Turbo Preview",
    "gpt-4-0125-preview": "GPT-4 (Jan 2025 Preview)",
    "gpt-4-1106-preview": "GPT-4 (Nov 2023 Preview)",
    "gpt-4": "GPT-4",
    "gpt-3.5-turbo": "GPT-3.5 Turbo",
    "gpt-3.5-turbo-1106": "GPT-3.5 Turbo (Nov 2023)",
    
    # OpenAI - O-Series Models
    "o4-mini": "o4 Mini",
    "o3": "o3",
    "o3-mini": "o3 Mini",
    "o3-pro": "o3 Pro",
    "o1": "o1",
    "o1-preview": "o1 Preview",
    "o1-mini": "o1 Mini",
    
    # Anthropic - Claude 4.6 (Latest)
    "claude-opus-4-6": "Claude Opus 4.6 (Latest)",
    "claude-opus-4-6-20260205": "Claude Opus 4.6 (Feb 2026)",
    "claude-sonnet-4-6": "Claude Sonnet 4.6 (Latest)",
    
    # Anthropic - Claude 4.5
    "claude-sonnet-4-5": "Claude Sonnet 4.5",
    "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5 (Sep 2025)",
    "claude-opus-4-5": "Claude Opus 4.5",
    "claude-opus-4-5-20251101": "Claude Opus 4.5 (Nov 2025)",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5 (Oct 2025)",
    
    # Anthropic - Claude 4.1
    "claude-opus-4-1": "Claude Opus 4.1",
    "claude-opus-4-1-20250805": "Claude Opus 4.1 (Aug 2025)",
    
    # Anthropic - Claude 4.0
    "claude-opus-4": "Claude Opus 4",
    "claude-opus-4-20250514": "Claude Opus 4 (May 2025)",
    "claude-sonnet-4": "Claude Sonnet 4",
    "claude-sonnet-4-20250514": "Claude Sonnet 4 (May 2025)",
    
    # Anthropic - Claude 3.7
    "claude-3-7-sonnet": "Claude 3.7 Sonnet",
    "claude-3-7-sonnet-20250219": "Claude 3.7 Sonnet (Feb 2025)",
    
    # Anthropic - Claude 3.5
    "claude-3-5-sonnet": "Claude 3.5 Sonnet",
    "claude-3-5-sonnet-20240620": "Claude 3.5 Sonnet (Jun 2024)",
    "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet (Oct 2024)",
    
    # Anthropic - Claude 3.0
    "claude-3-sonnet": "Claude 3 Sonnet",
    "claude-3-sonnet-20240229": "Claude 3 Sonnet (Feb 2024)",
    "claude-3-haiku": "Claude 3 Haiku",
    "claude-3-haiku-20240307": "Claude 3 Haiku (Mar 2024)",
    "claude-3-opus": "Claude 3 Opus",
    "claude-3-opus-20240229": "Claude 3 Opus (Feb 2024)",
    
    # Google AI Studio - Gemini 3.x Series (Latest)
    "gemini/gemini-3.1-pro-preview": "Gemini 3.1 Pro (Preview)",
    "gemini/gemini-3-flash-preview": "Gemini 3 Flash (Preview)",
    "gemini/gemini-3-pro-preview": "Gemini 3 Pro (Preview)",
    "gemini/gemini-3.1-flash-image-preview": "Gemini 3.1 Flash Image (Nano Banana 2)",
    "gemini/gemini-3-pro-image-preview": "Gemini 3 Pro Image (Nano Banana Pro)",
    
    # Google AI Studio - Gemini 2.5 Series
    "gemini/gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini/gemini-2.5-pro-preview-09-2025": "Gemini 2.5 Pro (Sep 2025)",
    "gemini/gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini/gemini-2.5-flash-preview-09-2025": "Gemini 2.5 Flash (Sep 2025)",
    "gemini/gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
    "gemini/gemini-2.5-flash-lite-preview-09-2025": "Gemini 2.5 Flash-Lite (Sep 2025)",
    "gemini/gemini-2.5-flash-image": "Gemini 2.5 Flash Image (Nano Banana)",
    "gemini/gemini-2.5-flash-preview-tts": "Gemini 2.5 Flash TTS",
    "gemini/gemini-2.5-pro-preview-tts": "Gemini 2.5 Pro TTS",
    "gemini/gemini-2.5-computer-use-preview-10-2025": "Gemini 2.5 Computer Use (Oct 2025)",
    
    # Google AI Studio - Gemini 2.0 Series
    "gemini/gemini-2.0-flash": "Gemini 2.0 Flash",
    "gemini/gemini-2.0-flash-exp": "Gemini 2.0 Flash (Experimental)",
    "gemini/gemini-2.0-flash-lite-preview-02-05": "Gemini 2.0 Flash-Lite (Feb 2025)",
    
    # Google AI Studio - Gemini 1.5 Series
    "gemini/gemini-1.5-pro": "Gemini 1.5 Pro",
    "gemini/gemini-1.5-pro-latest": "Gemini 1.5 Pro (Latest)",
    "gemini/gemini-1.5-flash": "Gemini 1.5 Flash",
    "gemini/gemini-pro": "Gemini Pro",
    "gemini/gemini-pro-vision": "Gemini Pro Vision",
    
    # XAI - Grok Models
    "xai/grok-4": "Grok 4",
    "xai/grok-3": "Grok 3",
    "xai/grok-3-mini-beta": "Grok 3 Mini Beta",
    "xai/grok-2-latest": "Grok 2 (Latest)",
    "xai/grok-2": "Grok 2",
    "xai/grok-beta": "Grok Beta",
    
    # Groq - Ultra-fast Inference
    "groq/llama-3.1-405b-reasoning": "Groq Llama 3.1 405B (Ultra-fast)",
    "groq/llama-3.1-70b-versatile": "Groq Llama 3.1 70B (Fast)",  
    "groq/llama-3.1-8b-instant": "Groq Llama 3.1 8B (Instant)",
    "groq/llama-3.2-90b-vision-preview": "Groq Llama 3.2 90B Vision",
    "groq/mixtral-8x7b-32768": "Groq Mixtral 8x7B (Fast)",
    "groq/gemma-7b-it": "Groq Gemma 7B (Fast)",
    "groq/gemma2-9b-it": "Groq Gemma 2 9B (Fast)",
    
    # Perplexity
    "perplexity/sonar-pro": "Perplexity Sonar Pro (Online)",
    "perplexity/sonar": "Perplexity Sonar (Online)",
    "perplexity/sonar-reasoning": "Perplexity Sonar Reasoning (Online)",
    "perplexity/r1-1776": "Perplexity R1-1776",
    
    # Mistral
    "mistral/mistral-large-latest": "Mistral Large (Latest)",
    "mistral/mistral-large-2411": "Mistral Large 24.11",
    "mistral/mistral-medium-latest": "Mistral Medium",
    "mistral/mistral-small-latest": "Mistral Small",
    "mistral/codestral-latest": "Codestral (Code Specialist)",
    "mistral/mistral-nemo": "Mistral Nemo",
    "mistral/open-mistral-7b": "Mistral 7B (Open)",
    "mistral/open-mixtral-8x7b": "Mixtral 8x7B (Open)",
    "mistral/open-mixtral-8x22b": "Mixtral 8x22B (Open)",
    
    # Microsoft Azure 
    "azure-gpt-4o": "Azure GPT-4o",
    "azure-gpt-4-turbo": "Azure GPT-4 Turbo",
    "azure-gpt-35-turbo": "Azure GPT-3.5 Turbo",
    
    # Ollama models (Local)
    "ollama-llama3.1": "Ollama Llama 3.1 (Local)",
    "ollama-llama3.2": "Ollama Llama 3.2 (Local)",
    "ollama-llama3": "Ollama Llama 3 (Local)",
    "ollama-llama2": "Ollama Llama 2 (Local)",
    "ollama-codellama": "Ollama CodeLlama (Local)",
    "ollama-mistral": "Ollama Mistral (Local)",
    "ollama-phi3": "Ollama Phi-3 (Local)",
    "ollama-gemma2": "Ollama Gemma 2 (Local)",
    
    # Cohere
    "command-r-plus": "Cohere Command R+ (Enterprise)",
    "command-r": "Cohere Command R (Enterprise)", 
    "command-r-plus-08-2024": "Cohere Command R+ (Aug 2024)",
    "command-a-03-2025": "Cohere Command A (Mar 2025)",
    
    # Together AI
    "together_ai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo": "Together AI Llama 3.1 405B",
    "together_ai/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo": "Together AI Llama 3.1 70B",
    "together_ai/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo": "Together AI Llama 3.1 8B",
    "together_ai/meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo": "Together AI Llama 3.2 90B Vision",
    "together_ai/mistralai/Mixtral-8x7B-Instruct-v0.1": "Together AI Mixtral 8x7B",
    "together_ai/Qwen/Qwen2.5-72B-Instruct-Turbo": "Together AI Qwen 2.5 72B",
    
    # Replicate
    "replicate/meta/meta-llama-3-70b-instruct": "Replicate Llama 3 70B",
    "replicate/meta/meta-llama-3-8b-instruct": "Replicate Llama 3 8B",
    "replicate/mistralai/mistral-7b-instruct-v0.1": "Replicate Mistral 7B",
    
    # DeepSeek - Advanced Reasoning
    "deepseek/deepseek-chat": "DeepSeek Chat",
    "deepseek/deepseek-coder": "DeepSeek Coder",
    "deepseek/deepseek-reasoner": "DeepSeek Reasoner",
    "deepseek/deepseek-r1": "DeepSeek R1 (Reasoning)",
    "deepseek/deepseek-v3": "DeepSeek V3",
    
    # AI21 Labs
    "ai21/jamba-1.5-large": "AI21 Jamba 1.5 Large",
    "ai21/jamba-1.5-mini": "AI21 Jamba 1.5 Mini",
    "ai21/jamba-instruct": "AI21 Jamba Instruct",
    
    # Fireworks AI
    "fireworks_ai/accounts/fireworks/models/llama-v3p2-90b-instruct": "Fireworks AI Llama 3.2 90B",
    "fireworks_ai/accounts/fireworks/models/llama-v3p1-70b-instruct": "Fireworks AI Llama 3.1 70B",
    "fireworks_ai/accounts/fireworks/models/qwen2-72b-instruct": "Fireworks AI Qwen 2 72B",
    
    # Cerebras - Ultra-fast Inference
    "cerebras/llama3.1-70b": "Cerebras Llama 3.1 70B (Ultra-fast)",
    "cerebras/llama3.1-8b": "Cerebras Llama 3.1 8B (Ultra-fast)",
    "cerebras/llama3.2-1b": "Cerebras Llama 3.2 1B (Ultra-fast)",
    "cerebras/llama3.2-3b": "Cerebras Llama 3.2 3B (Ultra-fast)"
}

def get_available_models():
    """Get a list of all AI models that can be used in the interface"""
    return [{"value": model, "display": MODEL_DISPLAY_NAMES.get(model, model)} 
            for model in MODEL_DISPLAY_NAMES.keys()]

def get_available_providers():
    """Get a list of providers that have API keys configured"""
    provider_keys = {
        "OpenAI": "OPENAI_API_KEY",
        "Anthropic": "ANTHROPIC_API_KEY", 
        "Google AI Studio": "GEMINI_API_KEY",
        "XAI": "XAI_API_KEY",
        "Groq": "GROQ_API_KEY",
        "Perplexity": "PERPLEXITY_API_KEY", 
        "Mistral": "MISTRAL_API_KEY",
        "Cohere": "COHERE_API_KEY",
        "AI21": "AI21_API_KEY",
        "Together": "TOGETHER_API_KEY",
        "Fireworks": "FIREWORKS_API_KEY",
        "Replicate": "REPLICATE_API_TOKEN",
        "Cerebras": "CEREBRAS_API_KEY",
        "DeepSeek": "DEEPSEEK_API_KEY",
        "Azure": "AZURE_OPENAI_API_KEY",
        "Hugging Face": "HUGGINGFACE_API_KEY",
        "NVIDIA": "NVIDIA_NIM_API_KEY",
        "OpenRouter": "OPENROUTER_API_KEY",
        "Ollama": "LOCAL"
    }
    # checking for keys for the provider list in the dashboard
    available = []
    for provider, key in provider_keys.items():
        if key == "LOCAL":
            available.append(provider)
        elif provider == "Google AI Studio":
            if os.getenv("GEMINI_API_KEY"):
                available.append(provider)
        elif provider == "Perplexity":
            if os.getenv("PERPLEXITY_API_KEY") or os.getenv("PERPLEXITYAI_API_KEY"):
                available.append(provider)
        elif provider == "Together":
            if os.getenv("TOGETHER_API_KEY") or os.getenv("TOGETHERAI_API_KEY"):
                available.append(provider)
        elif provider == "Fireworks":
            if os.getenv("FIREWORKS_API_KEY") or os.getenv("FIREWORKS_AI_API_KEY"):
                available.append(provider)
        elif provider == "Replicate":
            if os.getenv("REPLICATE_API_TOKEN") or os.getenv("REPLICATE_API_KEY"):
                available.append(provider)
        elif os.getenv(key):
            available.append(provider)
    
    return available

def get_provider_status():
    """Get detailed status of each provider (configured or not) - SECURE VERSION
    
    Returns a dictionary with provider names as keys and their configuration status.
    This function is designed to be secure and NEVER exposes actual API keys.
    """
    provider_keys = {
        "OpenAI": "OPENAI_API_KEY",
        "Anthropic": "ANTHROPIC_API_KEY", 
        "Google AI Studio": "GEMINI_API_KEY",
        "XAI": "XAI_API_KEY",
        "Groq": "GROQ_API_KEY",
        "Perplexity": "PERPLEXITY_API_KEY",
        "Mistral": "MISTRAL_API_KEY",
        "Cohere": "COHERE_API_KEY",
        "AI21": "AI21_API_KEY",
        "Together": "TOGETHER_API_KEY",
        "Fireworks": "FIREWORKS_API_KEY",
        "Replicate": "REPLICATE_API_TOKEN",
        "Cerebras": "CEREBRAS_API_KEY",
        "DeepSeek": "DEEPSEEK_API_KEY",
        "Azure": "AZURE_OPENAI_API_KEY",
        "Hugging Face": "HUGGINGFACE_API_KEY",
        "NVIDIA": "NVIDIA_NIM_API_KEY",
        "OpenRouter": "OPENROUTER_API_KEY",
        "Ollama": "LOCAL"
    }
    
    provider_status = {}
    
    for provider, env_key in provider_keys.items():
        if env_key == "LOCAL":
            provider_status[provider] = {
                "configured": True,
                "status": "Available (Local)",
                "category": "Local AI"
            }
        else:
            is_configured = False
            
            if provider == "Perplexity":
                is_configured = bool((os.getenv("PERPLEXITY_API_KEY") or os.getenv("PERPLEXITYAI_API_KEY", "")).strip())
            elif provider == "Together":
                is_configured = bool((os.getenv("TOGETHER_API_KEY") or os.getenv("TOGETHERAI_API_KEY", "")).strip())
            elif provider == "Fireworks":
                is_configured = bool((os.getenv("FIREWORKS_API_KEY") or os.getenv("FIREWORKS_AI_API_KEY", "")).strip())
            elif provider == "Replicate":
                is_configured = bool((os.getenv("REPLICATE_API_TOKEN") or os.getenv("REPLICATE_API_KEY", "")).strip())
            else:
                api_key = os.getenv(env_key)
                is_configured = bool(api_key and api_key.strip())
            
            provider_status[provider] = {
                "configured": is_configured,
                "status": "Configured" if is_configured else "Not Configured",
                "category": get_provider_category(provider)
            }
    
    return provider_status

def get_provider_category(provider_name):
    """Categorize providers for better organization"""
    categories = {
        "OpenAI": "Primary Provider",
        "Anthropic": "Primary Provider", 
        "Google AI Studio": "Primary Provider",
        "XAI": "Primary Provider",
        "Groq": "Other",
        "Perplexity": "Other",
        "Mistral": "Other",
        "Cohere": "Other",
        "AI21": "Other",
        "Together": "Other",
        "Fireworks": "Other",
        "Replicate": "Other",
        "Cerebras": "Other",
        "DeepSeek": "Other",
        "Azure": "Other",
        "Hugging Face": "Other",
        "NVIDIA": "Other",
        "OpenRouter": "Other",
        "Ollama": "Local"
    }
    return categories.get(provider_name, "Other")

def litellm_api_request(model="gpt-4.1",
                       messages=None,
                       temperature=1,
                       top_p=1,
                       presence_penalty=0,
                       frequency_penalty=0,
                       max_tokens=300,
                       logprobs=True,
                       reasoning_effort=None,
                       tools=None,
                       tool_choice=None):
    
    if messages is None:
        messages = []
    
    try:
        params = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens
        }
        
        if "gpt" in model or "o1" in model:
            # OpenAI stuff
            params["temperature"] = temperature
            params["top_p"] = top_p
            params["presence_penalty"] = presence_penalty
            params["frequency_penalty"] = frequency_penalty
            if logprobs and "o1" not in model:
                params["logprobs"] = True
        elif "claude" in model:
            # Anthropic models don't support presence/frequency penalties
            # Anthropic API only allows temperature OR top_p, not both
            # Use temperature as the primary parameter (more intuitive)
            params["temperature"] = temperature
        elif "grok" in model:
            # XAI models - some support penalties, others don't
            params["temperature"] = temperature
            params["top_p"] = top_p
            if "grok-4" not in model:
                # Most Grok models support penalties except grok-4
                params["presence_penalty"] = presence_penalty
                params["frequency_penalty"] = frequency_penalty
            # grok-4 currently only supports basic parameters
        elif any(provider in model for provider in ["groq", "perplexity", "mistral", "cohere"]):
            # These providers generally support temperature and top_p
            params["temperature"] = temperature
            params["top_p"] = top_p
        elif any(provider in model for provider in ["together", "replicate", "fireworks", "cerebras"]):
            # These providers generally support temperature and top_p
            params["temperature"] = temperature
            params["top_p"] = top_p
        elif "gemini" in model:
            # Google Gemini models
            params["temperature"] = temperature
            params["top_p"] = top_p
        elif "deepseek" in model:
            # DeepSeek models
            params["temperature"] = temperature
            params["top_p"] = top_p
        elif "ollama" in model:
            # Ollama local models
            params["temperature"] = temperature
            params["top_p"] = top_p
        elif any(provider in model for provider in ["azure", "bedrock"]):
            if "azure" in model:
                params["temperature"] = temperature
                params["top_p"] = top_p
                params["presence_penalty"] = presence_penalty
                params["frequency_penalty"] = frequency_penalty
        else:
            # Default: include temperature and top_p for other models
            params["temperature"] = temperature
            params["top_p"] = top_p

        # Optional advanced parameters (LiteLLM will map or ignore depending on provider/model)
        if reasoning_effort not in (None, ""):
            params["reasoning_effort"] = reasoning_effort
        if tools:
            params["tools"] = tools
        if tool_choice not in (None, ""):
            params["tool_choice"] = tool_choice
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            warnings.simplefilter("ignore", DeprecationWarning)
            
            import litellm
            
            original_drop_params = getattr(litellm, 'drop_params', None)
            litellm.drop_params = True
            
            try:
                response = completion(**params)
            finally:
                if original_drop_params is not None:
                    litellm.drop_params = original_drop_params
        
        usage = getattr(response, 'usage', None)
        prompt_tokens = getattr(usage, 'prompt_tokens', 0) if usage else 0
        completion_tokens = getattr(usage, 'completion_tokens', 0) if usage else 0
        total_tokens = getattr(usage, 'total_tokens', 0) if usage else 0
        
        # This is trying to get logprobs. However, a lot of companies are deprecating this feature.
        logprobs_list = []
        try:
            if hasattr(response, 'choices') and response.choices:
                choice = response.choices[0]
                if hasattr(choice, 'logprobs') and choice.logprobs:
                    if hasattr(choice.logprobs, 'content') and choice.logprobs.content:
                        logprobs_list = [
                            getattr(content, 'logprob', 0) 
                            for content in choice.logprobs.content 
                            if hasattr(content, 'logprob')
                        ]
        except (AttributeError, IndexError, TypeError):
            # If we can't get probability scores, just use empty list
            logprobs_list = []
        
        # Get the AI's response text safely
        try:
            response_content = response.choices[0].message.content
        except (AttributeError, IndexError):
            response_content = "Error: Could not extract response content"
        
        # Package the response in a standard format
        formatted_response = {
            "choices": [{
                "message": {
                    "content": response_content
                }
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens
            },
            "model": model  # Return the actual model used (same as requested)
        }
        
        return formatted_response, prompt_tokens, completion_tokens, total_tokens, logprobs_list, model
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error with model {model}: {error_msg}")
        
        # error response
        error_response = {
            "choices": [{
                "message": {
                    "content": f"Error: {error_msg}"
                }
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            "model": model
        }
        return error_response, 0, 0, 0, [], model

class API_Call():
    def __init__(self, agent=None):
        # Set up connections to AI providers
        self._setup_litellm()
        
        if agent is None:
            self.agent_data = load_agent("agents/default.json")
        else:
            self.agent_data = load_agent(f"agents/{agent}.json")
    
    def _setup_litellm(self):
        """Set up connections to various AI services using saved passwords"""
        os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY", "")
        os.environ["ANTHROPIC_API_KEY"] = os.getenv("ANTHROPIC_API_KEY", "")
        
        gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_api_key:
            os.environ["GEMINI_API_KEY"] = gemini_api_key
            os.environ["GOOGLE_API_KEY"] = gemini_api_key
        
        os.environ["XAI_API_KEY"] = os.getenv("XAI_API_KEY", "")
        
        xai_api_key = os.getenv("XAI_API_KEY", "")
        if xai_api_key:
            os.environ["XAI_API_BASE"] = os.getenv("XAI_API_BASE", "https://api.x.ai/v1")
        
        os.environ["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY", "")
        
        perplexity_key = os.getenv("PERPLEXITY_API_KEY", "")
        if perplexity_key:
            os.environ["PERPLEXITYAI_API_KEY"] = perplexity_key
        os.environ["PERPLEXITYAI_API_KEY"] = os.getenv("PERPLEXITYAI_API_KEY", os.getenv("PERPLEXITY_API_KEY", ""))
        
        os.environ["MISTRAL_API_KEY"] = os.getenv("MISTRAL_API_KEY", "")
        
        azure_key = os.getenv("AZURE_OPENAI_API_KEY", "")
        azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
        azure_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")
        if azure_key and azure_endpoint:
            os.environ["AZURE_API_KEY"] = azure_key
            os.environ["AZURE_API_BASE"] = azure_endpoint
            os.environ["AZURE_API_VERSION"] = azure_version
        
        ollama_base = os.getenv("OLLAMA_API_BASE", "http://localhost:11434")
        os.environ["OLLAMA_API_BASE"] = ollama_base
        
        optional_providers = {
            "COHERE_API_KEY": "COHERE_API_KEY",
            "AI21_API_KEY": "AI21_API_KEY",
            
            "TOGETHER_API_KEY": "TOGETHERAI_API_KEY", 
            "FIREWORKS_API_KEY": "FIREWORKS_AI_API_KEY", 
            "REPLICATE_API_TOKEN": "REPLICATE_API_KEY", 
            "CEREBRAS_API_KEY": "CEREBRAS_API_KEY",
            
            "DEEPSEEK_API_KEY": "DEEPSEEK_API_KEY",
            
            "HUGGINGFACE_API_KEY": "HUGGINGFACE_API_KEY",
            "NVIDIA_NIM_API_KEY": "NVIDIA_NIM_API_KEY",
            "OPENROUTER_API_KEY": "OPENROUTER_API_KEY",
            
            "AWS_ACCESS_KEY_ID": "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY": "AWS_SECRET_ACCESS_KEY",
            "AWS_REGION_NAME": "AWS_REGION_NAME"
        }
        
        for env_key, litellm_key in optional_providers.items():
            value = os.getenv(env_key, "")
            if value:
                os.environ[litellm_key] = value
        
        provider_mappings = {
            "BEDROCK_AWS_REGION": os.getenv("AWS_REGION_NAME", "us-east-1")
        }
        
        for key, value in provider_mappings.items():
            if value:
                os.environ[key] = value
        
        try:
            litellm.drop_params = True  # Ignore unsupported settings instead of showing errors
            litellm.set_verbose = False  # Turn off technical messages (set to True for debugging)
            
        except Exception as e:
            print(f"Warning: Could not configure litellm advanced settings: {e}")
        
        # Hide technical warning messages that users don't need to see
        warnings.filterwarnings("ignore", category=UserWarning, module="pydantic.main")
        warnings.filterwarnings("ignore", category=UserWarning, module="litellm")
        warnings.filterwarnings("ignore", category=UserWarning, module="openai")
        
    def update_agent(self, filename):
        self.agent_data = load_agent(filename)
   
    def thinkAbout(self, message, conversation, model=None, debug=False):
        if model is None:
            model = self.agent_data.get("model", "gpt-4.1")
        
        # Make a copy of the conversation to avoid changing the original
        working_conversation = conversation.copy()
        
        # Add the system message (pre_prompt)
        system_prompt = self.agent_data.get("PrePrompt", "")
        if system_prompt:
            working_conversation.insert(0, {"role": "system", "content": system_prompt})

        # Add the user's new message
        formatted_message = {"role": "user", "content": message}
        working_conversation.append(formatted_message)

        try:
            # Hide technical warnings during AI conversation. Use for debuggin if nneeded.
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                response, prompt_tokens, completion_tokens, total_tokens, logprobs_list, actual_model = litellm_api_request(
                    model=model,
                    messages=working_conversation,
                    temperature=self.agent_data.get("temperature", 1),
                    frequency_penalty=self.agent_data.get("frequency_penalty", 0),
                    presence_penalty=self.agent_data.get("presence_penalty", 0),
                    top_p=self.agent_data.get("top_p", 1),
                    max_tokens=self.agent_data.get("max_completion_tokens", 300),
                    reasoning_effort=self.agent_data.get("reasoning_effort"),
                    tools=self.agent_data.get("tools"),
                    tool_choice=self.agent_data.get("tool_choice")
                )
        except Exception as e:
            # If something goes wrong, return an error message
            print(f"Unexpected error in thinkAbout: {str(e)}")
            response = {
                'choices': [{'message': {'content': f"Error: {str(e)}"}}], 
                'usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
            }
            prompt_tokens, completion_tokens, total_tokens, logprobs_list, actual_model = 0, 0, 0, [], model

        # Handle error responses from the AI
        if "error" in response:
            conversation.append({"role": "assistant", "content": response["error"]["message"]})
            return conversation, 0, 0, 0, [], model

        # Add the AI's response to the conversation
        assistant_message = response['choices'][0]['message']['content']
        conversation.append({"role": "assistant", "content": assistant_message})

        # Some debugging logs stuff
        if debug:
            with open("logs.txt", "w", encoding="utf-8") as file:
                for i in conversation:
                    file.write(str(i) + "\n")

        # Debuggin for logprobs stuff
        if not logprobs_list and debug:
            print("Logprobs are empty. Response:", response)

        return conversation, prompt_tokens, completion_tokens, total_tokens, logprobs_list, actual_model