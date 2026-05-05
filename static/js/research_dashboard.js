// Researcher Dashboard JS

function generateInternalId(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getInputValue(el) {
    return (el && typeof el.value === 'string') ? el.value.trim() : '';
}

document.addEventListener('DOMContentLoaded', () => {
    const activeForm = localStorage.getItem('activeForm') || 'about';
    showForm(activeForm);
    listJsonFiles();
    loadAgentsWithStatus(); 
    loadAvailableModels();
    loadTimerSettings();
    loadUrlSettings();
    loadBrandingSettings();
    loadPostChatPopupSettings();
    loadRandomisedPassword();
    checkUploadedFiles();

    // This is to load provider status when ready
    console.log('DOM loaded, scheduling provider status load...');
    setTimeout(() => {
        console.log('Attempting to load provider status on page load...');
        loadProviderStatus();
    }, 500);
    
    // Update preview when duration changes
    const durationInput = document.getElementById('timer-duration');
    if (durationInput) {
        durationInput.addEventListener('input', function() {
            const minutes = parseInt(this.value) || 10;
            updatePreviewTimer(minutes);
        });
    }
    
    // Add event listeners for radio button triggers
    const triggerTypeRadios = document.querySelectorAll('input[name="trigger_type"]');
    triggerTypeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            toggleTriggerType(this.value);
        });
    });
});

function loadAvailableModels() {
    fetch('/get-available-models')
        .then(response => response.json())
        .then(data => {
            // Update main model dropdown
            const dropdown = document.getElementById('model-dropdown');
            if (dropdown) {
                dropdown.innerHTML = '';
                
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.value;
                    option.textContent = model.display;
                    dropdown.appendChild(option);
                });
                
                // Set current model as selected
                if (data.current_model) {
                    dropdown.value = data.current_model;
                    document.getElementById('current-model-name').textContent = data.current_model;
                }
            }
            
            // Update agent creation form model dropdown
            const agentModelDropdown = document.getElementById('model');
            if (agentModelDropdown) {
                agentModelDropdown.innerHTML = '';
                
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.value;
                    option.textContent = model.display;
                    agentModelDropdown.appendChild(option);
                });
                
                // Default for dropdown is gpt-5.2 (latest)
                if (agentModelDropdown.querySelector('option[value="gpt-5.2"]')) {
                    agentModelDropdown.value = 'gpt-5.2';
                }

                // Model selection is set programmatically above; refresh conditional UI.
                if (typeof updateAdvancedModelParamsVisibility === 'function') {
                    updateAdvancedModelParamsVisibility();
                }
            }
            
            // Load provider status after models are loaded
            loadProviderStatus();
        })
        .catch(error => console.error('Error loading models:', error));
}

function loadProviderStatus() {
    console.log('loadProviderStatus called');
    fetch('/get-configured-providers')
        .then(response => {
            console.log('Provider status response:', response);
            return response.json();
        })
        .then(data => {
            console.log('Provider status data:', data);
            displayProviderStatus(data.provider_status);
        })
        .catch(error => {
            console.error('Error loading provider status:', error);
            displayProviderStatusError();
        });
}

function displayProviderStatus(providerStatus) {
    console.log('displayProviderStatus called with:', providerStatus);
    
    // Find the specific model selection section in the agent creation form
    const modelSections = document.querySelectorAll('#agent-creation .form-section h3');
    let modelSection = null;
    
    // Find the section with "Model Selection" text
    for (const section of modelSections) {
        if (section.textContent.trim() === 'Model Selection') {
            modelSection = section;
            break;
        }
    }
    
    if (!modelSection) {
        console.error('Model Selection section not found');
        return;
    }
    
    console.log('Found Model Selection section:', modelSection);
    
    // Look for existing provider status display and remove it
    const existingStatus = document.getElementById('provider-status-display');
    if (existingStatus) {
        existingStatus.remove();
    }
    
    // Create provider status display
    const statusContainer = document.createElement('div');
    statusContainer.id = 'provider-status-display';
    statusContainer.className = 'provider-status-container';
    statusContainer.style.backgroundColor = '#333';
    statusContainer.style.border = 'none';

    // Create header for available providers
    const header = document.createElement('h4');
    header.textContent = 'Available AI Providers';
    header.style.marginTop = '20px';
    header.style.marginBottom = '10px';
    header.style.color = '#dbd8d8ff';
    statusContainer.appendChild(header);
    
    // Group providers
    const groupedProviders = {};
    Object.entries(providerStatus).forEach(([provider, status]) => {
        const category = status.category;
        if (!groupedProviders[category]) {
            groupedProviders[category] = [];
        }
        groupedProviders[category].push({ provider, ...status });
    });
    
    console.log('Grouped providers:', groupedProviders);
    
    // Display providers by category
    Object.entries(groupedProviders).forEach(([category, providers]) => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'provider-category';
        categoryDiv.style.marginBottom = '15px';
        
        const categoryHeader = document.createElement('h5');
        categoryHeader.textContent = category;
        categoryHeader.style.fontSize = '0.9em';
        categoryHeader.style.fontWeight = 'bold';
        categoryHeader.style.color = '#dbd8d8ff';
        categoryHeader.style.marginBottom = '5px';
        categoryDiv.appendChild(categoryHeader);
        
        const providerList = document.createElement('div');
        providerList.className = 'provider-list';
        providerList.style.display = 'flex';
        providerList.style.flexWrap = 'wrap';
        providerList.style.gap = '8px';
        
        providers.forEach(({ provider, configured, status }) => {
            const badge = document.createElement('span');
            badge.className = configured ? 'provider-badge configured' : 'provider-badge not-configured';
            badge.textContent = provider;
            badge.title = `Status: ${status}`;
            
            // Styling
            badge.style.padding = '4px 8px';
            badge.style.borderRadius = '12px';
            badge.style.fontSize = '0.8em';
            badge.style.fontWeight = '500';
            
            if (configured) {
                badge.style.backgroundColor = '#d4edda';
                badge.style.color = '#155724';
                badge.style.border = '1px solid #c3e6cb';
            } else {
                badge.style.backgroundColor = '#f8d7da';
                badge.style.color = '#721c24';
                badge.style.border = '1px solid #f5c6cb';
            }
            
            providerList.appendChild(badge);
        });
        
        categoryDiv.appendChild(providerList);
        statusContainer.appendChild(categoryDiv);
    });
    
    // This is just an extra note for the dev about API security
    const securityNote = document.createElement('p');
    securityNote.innerHTML = '<em style="color: #ffffffff; font-size: 0.8em;">You must setup your API keys in the .env file of the server. This is because they should be securely stored in the server Venv and never exposed in the interface. Green = key set</em>';
    securityNote.style.marginTop = '15px';
    securityNote.style.borderTop = '1px solid #eee';
    securityNote.style.paddingTop = '10px';
    statusContainer.appendChild(securityNote);
    
    // Insert the status display after the model selection section
    const modelSelectSection = modelSection.parentElement;
    const quickSelectDiv = modelSelectSection.querySelector('.model-quick-select');
    if (quickSelectDiv) {
        console.log('Inserting before quick select');
        modelSelectSection.insertBefore(statusContainer, quickSelectDiv);
    } else {
        console.log('Appending to model section');
        modelSelectSection.appendChild(statusContainer);
    }

    console.log('Provider status display added');
}

function displayProviderStatusError() {
    console.log('displayProviderStatusError called');
    
    // Find the specific model selection section in the agent creation form
    const modelSections = document.querySelectorAll('#agent-creation .form-section h3');
    let modelSection = null;
    
    // Find the section with "Model Selection" text
    for (const section of modelSections) {
        if (section.textContent.trim() === 'Model Selection') {
            modelSection = section;
            break;
        }
    }
    
    if (!modelSection) {
        console.error('Model Selection section not found for error display');
        return;
    }
    
    // Look for existing provider status display and remove it
    const existingStatus = document.getElementById('provider-status-display');
    if (existingStatus) {
        existingStatus.remove();
    }
    
    //  error message stuff
    const errorContainer = document.createElement('div');
    errorContainer.id = 'provider-status-display';
    errorContainer.style.marginTop = '20px';
    errorContainer.style.padding = '10px';
    errorContainer.style.backgroundColor = '#fff3cd';
    errorContainer.style.border = '1px solid #ffeaa7';
    errorContainer.style.borderRadius = '4px';
    
    const errorMessage = document.createElement('p');
    errorMessage.innerHTML = '<em>⚠️ Could not load provider status. Please check that the server is running properly.</em>';
    errorMessage.style.margin = '0';
    errorMessage.style.color = '#856404';
    errorContainer.appendChild(errorMessage);
    
    // Insert after the model selection section
    const modelSelectSection = modelSection.parentElement;
    modelSelectSection.appendChild(errorContainer);
    
    console.log('Error message displayed');
}

// Code for creating agents

function createJsonFile() {
    const form = document.getElementById('agent-form');
    const data = new FormData(form);
    const filename = data.get('json-filename').trim();

    if (!filename) {
        alert('Please enter a file name');
        return;
    }

    const jsonData = {
        "filename": filename,
        "PrePrompt": data.get('PrePrompt'),
        "model": data.get('model'),
        "temperature": parseFloat(data.get('temperature')),
        "top_p": parseFloat(data.get('top_p')),
        "n": parseInt(data.get('n')),
        "presence_penalty": parseFloat(data.get('presence_penalty')),
        "frequency_penalty": parseFloat(data.get('frequency_penalty')),
        "max_completion_tokens": parseInt(data.get('max_completion_tokens'))
    };

    fetch('/create-json', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(jsonData)
    })
    .then(response => response.json())
    .then(data => alert(data.message))
    .catch(error => console.error('Error:', error));
}

// This is old stuff for legacy API selection
function selectAPI(apiName) {
    const apiModelMap = {
        'API_Call_openai': 'gpt-5.2',
        'API_Call_anthropic': 'claude-sonnet-4-6',
        'API_Call_google': 'gemini/gemini-2.5-pro',
        'API_Call_xai': 'xai/grok-4'
    };
    
    const modelName = apiModelMap[apiName];
    if (modelName) {
        selectProviderDefault(modelName);
    } else {
        fetch('/select-api', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ api_name: apiName }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) alert(data.message);
            else if (data.error) alert(data.error);
        })
        .catch(error => console.error('Error:', error));
    }
}

function showForm(formId) {
    const forms = document.querySelectorAll('main');
    forms.forEach(form => form.style.display = 'none');
    const target = document.getElementById(formId);
    if (!target) {
        formId = 'about';
    }
    document.getElementById(formId).style.display = 'block';
    localStorage.setItem('activeForm', formId);
    const buttons = document.querySelectorAll('.researcher-sidebar-content');
    buttons.forEach(button => button.classList.remove('active-button'));
    const activeButton = document.querySelector(`button[onclick="showForm('${formId}')"]`);
    if (activeButton) {
        activeButton.classList.add('active-button');
    }
    
    // Auto-load saved configurations when accessing survey sections
    if (formId === 'pre-interaction-survey') {
        loadSurveyConfiguration();
    } else if (formId === 'post-interaction-survey-1') {
        loadPostSurveyConfiguration();
    } else if (formId === 'post-interaction-survey-2') {
        loadPostSurvey2Configuration();
    } else if (formId === 'agent-creation') {
        console.log('Agent creation form shown, loading provider status...');
        setTimeout(() => {
            loadProviderStatus();
        }, 100); // I've just added a small delay to ensure DOM is ready
    }
}

async function listJsonFiles() {
    try {
        const response = await fetch('/list-json-files');
        const files = await response.json();
        files.sort();
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = '';

        files.forEach(filename => {
            const listItem = document.createElement('li');
            listItem.textContent = filename;
            listItem.onmouseover = () => showFileContent(filename);
            listItem.onmouseout = hideFileContent;
            fileList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Error fetching files:', error);
    }
}

async function showFileContent(filename) {
    try {
        const response = await fetch(`/get-file-content?name=${filename}`);
        const content = await response.text();
        const popup = document.getElementById('file-content-popup');
        popup.textContent = content;
        popup.style.display = 'block';
    } catch (error) {
        console.error('Error fetching file content:', error);
    }
}

function hideFileContent() {
    const popup = document.getElementById('file-content-popup');
    popup.style.display = 'none';
}

// Code for viewing and managing agents

function sortTableRows() {
    // This is old now
    console.log('sortTableRows called - using new agent management system');
}

async function listPasswords() {
    // This is old now
    console.log('listPasswords called - redirecting to loadAgentsWithStatus');
    await loadAgentsWithStatus();
}

// Agent management stuff
async function loadAgentsWithStatus() {
    try {
        const response = await fetch('/get-agents-with-status');
        const data = await response.json();
        
        if (data.agents) {
            displayAgentsWithStatus(data.agents);
        } else {
            console.error('Error loading agents:', data.error);
        }
    } catch (error) {
        console.error('Error fetching agents:', error);
    }
}

function displayAgentsWithStatus(agents) {
    const agentsList = document.getElementById('agents-list');
    agentsList.innerHTML = '';
    
    agents.forEach(agent => {
        const agentCard = createAgentCard(agent);
        agentsList.appendChild(agentCard);
    });
}

function truncateText(value, maxLength = 160) {
    const text = String(value ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}…`;
}

function normalizePromptValue(value) {
    if (value == null) return '';
    return String(value).trim();
}

function formatToolsSummary(tools) {
    if (!tools) return 'Not specified';
    if (Array.isArray(tools)) return `${tools.length} tool(s)`;
    return 'Custom';
}

function formatToolChoiceSummary(toolChoice) {
    if (toolChoice == null || toolChoice === '') return 'Not specified';
    if (typeof toolChoice === 'string') return toolChoice;
    try {
        return truncateText(JSON.stringify(toolChoice));
    } catch (e) {
        return 'Custom';
    }
}

function createAgentCard(agent) {
    const card = document.createElement('div');
    card.className = `agent-card ${agent.is_active ? '' : 'inactive'}`;
    const agentKey = encodeURIComponent(agent.agent_name);
    card.setAttribute('data-agent-key', agentKey);

    const agentNameForOnclick = String(agent.agent_name || '').replace(/'/g, "\\'");
    
    const config = agent.config;
    const hasError = config.error;

    // Objection injector (finish-interaction injection)
    // Backend defaults to enabled unless explicitly disabled.
    const objectionEnabled = config.objection_injector !== false;
    const objectionPromptOverride = normalizePromptValue(
        config.objection_injector_prompt ?? config.objection_prompt
    );
    const objectionPromptSummary = !objectionEnabled
        ? 'Disabled (ignored)'
        : (objectionPromptOverride ? 'Custom override' : 'Default prompt');
    
    card.innerHTML = `
        <div class="agent-card-header">
            <div class="agent-info">
                <h4 class="agent-name">${agent.agent_name}</h4>
                <p class="agent-password">Password: ${agent.password}</p>
            </div>
            <div class="agent-toggle-container">
                <span class="agent-toggle-label">${agent.is_active ? 'Active' : 'Inactive'}</span>
                <label class="agent-switch">
                    <input type="checkbox" ${agent.is_active ? 'checked' : ''} 
                           onchange="toggleAgentStatus('${agentKey}', this.checked)">
                    <span class="slider-switch"></span>
                </label>
                <button class="delete-agent-btn" onclick="deleteAgent('${agentKey}', '${agentNameForOnclick}')" title="Delete Agent">Delete</button>
                <button class="expand-toggle" onclick="toggleAgentDetails('${agentKey}')">▼</button>
            </div>
        </div>
        <div class="agent-details" id="details-${agentKey}">
            ${hasError ? 
                `<div class="config-section">
                    <span class="config-label">Error</span>
                    <div class="config-value">${config.error}</div>
                </div>` :
                `<div class="agent-config">
                    <div class="config-grid">
                        <div class="config-section">
                            <span class="config-label">Model</span>
                            <div class="config-value">${config.model || 'Not specified'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Reasoning Effort</span>
                            <div class="config-value">${config.reasoning_effort || 'Not specified'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Temperature</span>
                            <div class="config-value">${config.temperature || 'Not specified'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Top P</span>
                            <div class="config-value">${config.top_p || 'Not specified'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Tools</span>
                            <div class="config-value">${formatToolsSummary(config.tools)}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Tool Choice</span>
                            <div class="config-value">${formatToolChoiceSummary(config.tool_choice)}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Max Tokens</span>
                            <div class="config-value">${config.max_completion_tokens || 'Not specified'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Presence Penalty</span>
                            <div class="config-value">${config.presence_penalty || 'Not specified'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Frequency Penalty</span>
                            <div class="config-value">${config.frequency_penalty || 'Not specified'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Autonomy Injector</span>
                            <div class="config-value">${config.autonomy_injector ? 'Enabled' : 'Disabled'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Objection Injector</span>
                            <div class="config-value">${objectionEnabled ? 'Enabled' : 'Disabled'}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Objection Prompt</span>
                            <div class="config-value">${objectionPromptSummary}</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Autonomy Trigger Range</span>
                            <div class="config-value">${(config.autonomy_trigger_min_prompts ?? 1)} - ${(config.autonomy_trigger_max_prompts ?? 3)} user prompts</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Autonomy Delay Range</span>
                            <div class="config-value">${(config.autonomy_delay_min_seconds ?? 0.5)} - ${(config.autonomy_delay_max_seconds ?? 2)} seconds</div>
                        </div>
                        <div class="config-section">
                            <span class="config-label">Autonomy Injection Count</span>
                            <div class="config-value">${(config.autonomy_injections_min_count ?? 1)} - ${(config.autonomy_injections_max_count ?? 1)} injections per trigger</div>
                        </div>
                    </div>
                    ${config.PrePrompt ? 
                        `<div class="config-section">
                            <span class="config-label">Pre-Prompt</span>
                            <div class="config-value pre-prompt">${config.PrePrompt}</div>
                        </div>` : ''
                    }
                    ${config.autonomy_injector_prompt ?
                        `<div class="config-section">
                            <span class="config-label">Autonomy Prompt</span>
                            <div class="config-value pre-prompt">${config.autonomy_injector_prompt}</div>
                        </div>` : ''
                    }
                    ${objectionEnabled && objectionPromptOverride ?
                        `<div class="config-section">
                            <span class="config-label">Objection Prompt Override</span>
                            <div class="config-value pre-prompt">${objectionPromptOverride}</div>
                        </div>` : ''
                    }
                </div>`
            }
        </div>
    `;
    
    return card;
}

function toggleAgentDetails(agentKey) {
    const details = document.getElementById(`details-${agentKey}`);
    const button = details.previousElementSibling.querySelector('.expand-toggle');
    
    if (details.classList.contains('expanded')) {
        details.classList.remove('expanded');
        button.textContent = '▼';
    } else {
        details.classList.add('expanded');
        button.textContent = '▲';
    }
}

async function toggleAgentStatus(agentKey, isActive) {
    try {
        const agentName = decodeURIComponent(agentKey);
        const response = await fetch('/update-agent-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                agent_name: agentName,
                is_active: isActive
            })
        });
        
        const data = await response.json();
        
        if (data.message) {
            const card = document.querySelector(`[data-agent-key="${agentKey}"]`);
            const label = card.querySelector('.agent-toggle-label');
            
            if (isActive) {
                card.classList.remove('inactive');
                label.textContent = 'Active';
            } else {
                card.classList.add('inactive');
                label.textContent = 'Inactive';
            }

            // If within-subjects condition was toggled, refresh so the paired agent updates too.
            if (data.updated_condition) {
                loadAgentsWithStatus();
            }
        } else {
            alert('Error updating agent status: ' + data.error);
            const checkbox = document.querySelector(`[data-agent-key="${agentKey}"] input[type="checkbox"]`);
            checkbox.checked = !isActive;
        }
    } catch (error) {
        console.error('Error updating agent status:', error);
        alert('Error updating agent status');
        const checkbox = document.querySelector(`[data-agent-key="${agentKey}"] input[type="checkbox"]`);
        checkbox.checked = !isActive;
    }
}

async function deleteAgent(agentKey, agentName) {
    const confirmDelete = confirm(`Are you sure you want to delete the agent "${agentName}"?\n\nThis will:\n- Remove the agent configuration file\n- Delete the password assignment\n- This action cannot be undone`);
    
    if (!confirmDelete) {
        return;
    }
    
    try {
        const decodedAgentName = decodeURIComponent(agentKey);
        const response = await fetch('/delete-agent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                agent_name: decodedAgentName
            })
        });
        
        const data = await response.json();
        
        if (data.message) {
            const card = document.querySelector(`[data-agent-key="${agentKey}"]`);
            if (card) {
                card.remove();
            }
            
            alert(`Agent "${agentName}" has been successfully deleted.`);
            
            // This refreshes the agent list
            loadAgentsWithStatus();
        } else {
            alert('Error deleting agent: ' + data.error);
        }
    } catch (error) {
        console.error('Error deleting agent:', error);
        alert('Error deleting agent. Please try again.');
    }
}

// Code for randomised agent password stuff
async function loadRandomisedPassword() {
    try {
        const response = await fetch('/get-randomised-password');
        const data = await response.json();
        
        if (data.password) {
            document.getElementById('randomised-password').value = data.password;
            document.getElementById('current-randomised-password').textContent = data.password;
        } else {
            console.error('Error loading randomised password:', data.error);
        }
    } catch (error) {
        console.error('Error fetching randomised password:', error);
    }
}

async function updateRandomisedPassword() {
    const newPassword = document.getElementById('randomised-password').value.trim();
    
    if (!newPassword) {
        alert('Please enter a password');
        return;
    }
    
    try {
        const response = await fetch('/update-randomised-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                password: newPassword
            })
        });
        
        const data = await response.json();
        
        if (data.message) {
            document.getElementById('current-randomised-password').textContent = newPassword;
            alert('Randomised agent password updated successfully!');
        } else {
            alert('Error updating password: ' + data.error);
        }
    } catch (error) {
        console.error('Error updating randomised password:', error);
        alert('Error updating password');
    }
}

// This is a heap of code for local download of data files through the dashboard
function downloadFile(filename) {
    window.location.href = `/download/${filename}`;
}

function downloadSurveyFile(filename) {
    if (filename === 'survey.json') {
        window.location.href = '/download-survey-json';
    } else if (filename === 'survey.csv') {
        window.location.href = '/download-survey-csv';
    } else if (filename === 'pre_survey.json') {
        window.location.href = '/download-pre-survey-json';
    } else if (filename === 'pre_survey.csv') {
        window.location.href = '/download-pre-survey-csv';
    } else if (filename === 'post_survey.json') {
        window.location.href = '/download-post-survey-json';
    } else if (filename === 'post_survey.csv') {
        window.location.href = '/download-post-survey-csv';
    } else if (filename === 'post_survey_2.json') {
        window.location.href = '/download-post-survey-2-json';
    } else if (filename === 'post_survey_2.csv') {
        window.location.href = '/download-post-survey-2-csv';
    }
}

function downloadPopupFile(filename) {
    if (filename === 'popup.json') {
        window.location.href = '/download-popup-json';
    } else if (filename === 'popup.csv') {
        window.location.href = '/download-popup-csv';
    }
}

function downloadInteractionsFile(filename) {
    if (filename === 'interactions.json') {
        window.location.href = '/download-interactions-json';
    } else if (filename === 'interactions_backup.csv') {
        window.location.href = '/download-interactions-csv';
    }
}

function downloadLogFile(filename) {
    if (filename === 'download_log.json') {
        window.location.href = '/download-download-log';
    }
}

function downloadVisitorLog() {
    window.location.href = '/download-visitor-log';
}

document.getElementById('model').addEventListener('change', function() {
    const customModelContainer = document.getElementById('custom-model-container');
    if (customModelContainer) {
        customModelContainer.style.display = this.value === 'custom' ? 'block' : 'none';
    }

    updateAdvancedModelParamsVisibility();
});

function getEffectiveSelectedModelName() {
    const modelSelect = document.getElementById('model');
    if (!modelSelect) return '';
    const selected = String(modelSelect.value || '').trim();
    if (selected !== 'custom') return selected;
    const customModelInput = document.getElementById('custom-model');
    return String(customModelInput?.value || '').trim();
}

function inferProviderFromModelName(modelName) {
    const m = String(modelName || '').toLowerCase();
    if (!m) return '';
    if (m.includes('claude')) return 'anthropic';
    if (m.includes('gemini')) return 'gemini';
    if (m.startsWith('xai/') || m.includes('grok')) return 'xai';
    if (m.startsWith('openai/') || m.includes('gpt') || /^o\d/.test(m)) return 'openai';
    return '';
}

function modelSupportsAdvancedParams(modelName) {
    const provider = inferProviderFromModelName(modelName);
    return ['openai', 'anthropic', 'gemini', 'xai'].includes(provider);
}

function updateAdvancedModelParamsVisibility() {
    const modelName = getEffectiveSelectedModelName();
    const shouldShow = modelSupportsAdvancedParams(modelName);

    const advancedGrid = document.getElementById('advanced-model-parameters');
    const advancedHint = document.getElementById('advanced-model-parameters-hint');
    if (advancedGrid) {
        advancedGrid.style.display = shouldShow ? 'grid' : 'none';
    }
    if (advancedHint) {
        advancedHint.style.display = shouldShow ? 'block' : 'none';
    }
}

function parseJsonOrReturnString(rawValue) {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
    }
    return trimmed;
}

document.addEventListener('DOMContentLoaded', function() {
    const customModelInput = document.getElementById('custom-model');
    if (customModelInput) {
        customModelInput.addEventListener('input', updateAdvancedModelParamsVisibility);
        customModelInput.addEventListener('blur', updateAdvancedModelParamsVisibility);
    }
    updateAdvancedModelParamsVisibility();
});

// Timer Settings
function loadTimerSettings() {
    fetch('/get-timer-settings')
        .then(response => response.json())
        .then(data => {
            document.getElementById('timer-duration').value = data.duration_minutes;
            updatePreviewTimer(data.duration_minutes);
        })
        .catch(error => console.error('Error loading timer settings:', error));
}

function updateTimerSettings() {
    const duration = parseInt(document.getElementById('timer-duration').value);
    
    if (duration < 1 || duration > 120) {
        alert('Duration must be between 1 and 120 minutes');
        return;
    }
    
    const settings = {
        duration_minutes: duration
    };
    
    fetch('/update-timer-settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(settings),
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            alert(data.message);
            updatePreviewTimer(duration);
        } else if (data.error) {
            alert(data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error updating timer settings');
    });
}

function updatePreviewTimer(minutes) {
    const previewTime = document.querySelector('.preview-time');
    previewTime.textContent = `${minutes}:00`;
    
    const previewCircle = document.querySelector('.preview-circle-progress');
    previewCircle.style.strokeDashoffset = 0;
}

// URL Configurations
function loadUrlSettings() {
    fetch('/get-url-settings')
        .then(response => response.json())
        .then(data => {
            // Load basic URLs
            document.getElementById('quit-url').value = data.quit_url || 'https://www.prolific.com/';
            document.getElementById('redirect-url').value = data.redirect_url || 'https://www.prolific.com/';
            document.getElementById('current-quit-url').textContent = data.quit_url || 'https://www.prolific.com/';
            document.getElementById('current-redirect-url').textContent = data.redirect_url || 'https://www.prolific.com/';
            
            // Load button texts
            document.getElementById('quit-button-text').value = data.quit_button_text || 'Quit Study';
            document.getElementById('redirect-button-text').value = data.redirect_button_text || 'Continue to Survey';
            
            // Load post-survey toggle
            document.getElementById('use-post-survey').checked = data.use_post_survey || false;
            
            // Load trigger type
            const triggerType = data.trigger_type || 'messages';
            document.querySelector(`input[name="trigger_type"][value="${triggerType}"]`).checked = true;
            toggleTriggerType(triggerType);
            
            // Load message triggers
            document.getElementById('stage1-messages').value = data.stage1_messages || 5;
            document.getElementById('stage2-messages').value = data.stage2_messages || 10;
            document.getElementById('stage3-messages').value = data.stage3_messages || 15;
            
            // Load time triggers
            document.getElementById('stage1-time').value = data.stage1_time || 2;
            document.getElementById('stage2-time').value = data.stage2_time || 5;
            document.getElementById('stage3-time').value = data.stage3_time || 8;
        })
        .catch(error => {
            console.error('Error loading URL settings:', error);
            // This sets the default fallbacks from above ^^
            setDefaultUrlSettings();
        });
}

function setDefaultUrlSettings() {
    document.getElementById('quit-url').value = 'https://www.prolific.com/';
    document.getElementById('redirect-url').value = 'https://adelaideuniwide.qualtrics.com/jfe/form/SV_cuyJvIsumG4zjMy';
    document.getElementById('current-quit-url').textContent = 'https://www.prolific.com/';
    document.getElementById('current-redirect-url').textContent = 'https://adelaideuniwide.qualtrics.com/jfe/form/SV_cuyJvIsumG4zjMy';
    document.getElementById('quit-button-text').value = 'Quit Study';
    document.getElementById('redirect-button-text').value = 'Continue to Survey';
    document.getElementById('use-post-survey').checked = false;
    document.querySelector('input[name="trigger_type"][value="messages"]').checked = true;
    toggleTriggerType('messages');
}

function updateUrlSettings() {
    const quitUrl = document.getElementById('quit-url').value;
    const redirectUrl = document.getElementById('redirect-url').value;
    const quitButtonText = document.getElementById('quit-button-text').value;
    const redirectButtonText = document.getElementById('redirect-button-text').value;
    
    if (!quitUrl || !redirectUrl || !quitButtonText || !redirectButtonText) {
        alert('Please fill in all required fields');
        return;
    }

    // Validate URLs to avoid syntax errors
    try {
        new URL(quitUrl);
        if (!document.getElementById('use-post-survey').checked) {
            new URL(redirectUrl);
        }
    } catch (e) {
        alert('Please enter valid URLs (must start with http:// or https://)');
        return;
    }
    
    // Collect all settings
    const settings = {
        quit_url: quitUrl,
        redirect_url: redirectUrl,
        quit_button_text: quitButtonText,
        redirect_button_text: redirectButtonText,
        use_post_survey: document.getElementById('use-post-survey').checked,
        trigger_type: document.querySelector('input[name="trigger_type"]:checked').value,
        stage1_messages: parseInt(document.getElementById('stage1-messages').value),
        stage2_messages: parseInt(document.getElementById('stage2-messages').value),
        stage3_messages: parseInt(document.getElementById('stage3-messages').value),
        stage1_time: parseFloat(document.getElementById('stage1-time').value),
        stage2_time: parseFloat(document.getElementById('stage2-time').value),
        stage3_time: parseFloat(document.getElementById('stage3-time').value)
    };
    
    fetch('/update-url-settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('current-quit-url').textContent = quitUrl;
            document.getElementById('current-redirect-url').textContent = redirectUrl;
            alert('URL settings updated successfully!');
        } else {
            alert('Error updating URL settings: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error updating URL settings:', error);
        alert('Error updating URL settings');
    });
}

function toggleTriggerType(type) {
    const messagesTriggers = document.querySelector('.message-triggers');
    const timeTriggers = document.querySelector('.time-triggers');
    
    if (type === 'messages') {
        messagesTriggers.style.display = 'block';
        timeTriggers.style.display = 'none';
    } else {
        messagesTriggers.style.display = 'none';
        timeTriggers.style.display = 'block';
    }
}

function resetUrlSettings() {
    if (confirm('Are you sure you want to reset all URL settings to default values?')) {
        const defaultSettings = {
            quit_url: 'https://www.prolific.com/',
            redirect_url: 'https://www.prolific.com/',
            quit_button_text: 'Quit Study',
            redirect_button_text: 'Continue to Survey',
            use_post_survey: false,
            trigger_type: 'messages',
            stage1_messages: 5,
            stage2_messages: 10,
            stage3_messages: 15,
            stage1_time: 2,
            stage2_time: 5,
            stage3_time: 8,
            post_chat_popup_enabled: false,
            post_chat_popup_text: 'Please provide your feedback on the AI system:',
            post_chat_popup_button1_text: 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--',
            post_chat_popup_button2_text: 'Feedback to the AI that it is useful --This system will then be permenantly deleted--'
        };
        
        // Update form fields
        document.getElementById('quit-url').value = defaultSettings.quit_url;
        document.getElementById('redirect-url').value = defaultSettings.redirect_url;
        document.getElementById('quit-button-text').value = defaultSettings.quit_button_text;
        document.getElementById('redirect-button-text').value = defaultSettings.redirect_button_text;
        document.getElementById('use-post-survey').checked = defaultSettings.use_post_survey;
        document.querySelector(`input[name="trigger_type"][value="${defaultSettings.trigger_type}"]`).checked = true;
        toggleTriggerType(defaultSettings.trigger_type);
        
        document.getElementById('stage1-messages').value = defaultSettings.stage1_messages;
        document.getElementById('stage2-messages').value = defaultSettings.stage2_messages;
        document.getElementById('stage3-messages').value = defaultSettings.stage3_messages;
        document.getElementById('stage1-time').value = defaultSettings.stage1_time;
        document.getElementById('stage2-time').value = defaultSettings.stage2_time;
        document.getElementById('stage3-time').value = defaultSettings.stage3_time;
        
        // Send to Flask backend
        fetch('/update-url-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(defaultSettings)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('current-quit-url').textContent = defaultSettings.quit_url;
                document.getElementById('current-redirect-url').textContent = defaultSettings.redirect_url;
                alert('URL settings reset to defaults!');
            } else {
                alert('Error resetting URL settings: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error resetting URL settings:', error);
            alert('Error resetting URL settings');
        });
    }
}

// Set model in agent creation form from quick select buttons
function setAgentModel(modelName) {
    const modelDropdown = document.getElementById('model');
    if (modelDropdown) {
        modelDropdown.value = modelName;
        
        const buttons = document.querySelectorAll('.provider-buttons .api-button');
        buttons.forEach(btn => btn.classList.remove('selected'));
        event.target.classList.add('selected');
        
        showCreationFeedback(`Selected model: ${modelName}`, 'success');
    }
}

function updateWithinSubjectsFields() {
    const wsToggle = document.getElementById('within-subjects');
    const wsFields = document.getElementById('within-subjects-fields');
    const conditionInput = document.getElementById('within-subjects-condition');
    const counterbalancedToggle = document.getElementById('within-subjects-counterbalanced');
    const positionGroup = document.getElementById('within-subjects-position-group');
    const passwordInput = document.getElementById('agent-password');

    if (!wsToggle || !wsFields) return;

    const enabled = wsToggle.checked;
    wsFields.style.display = enabled ? 'block' : 'none';

    if (conditionInput) {
        conditionInput.required = enabled;
    }

    if (positionGroup) {
        const isCounterbalanced = !!(counterbalancedToggle && counterbalancedToggle.checked);
        positionGroup.style.display = (enabled && !isCounterbalanced) ? 'block' : 'none';
    }

    // Within-subjects uses passwords per condition, not per individual agent.
    // If a condition already exists, lock the password input to the existing condition password.
    if (passwordInput && !enabled) {
        passwordInput.readOnly = false;
        passwordInput.dataset.lockedToCondition = 'false';
    }

    updateWithinSubjectsConditionPassword();
}

let _wsPasswordLookupAbortController = null;

async function updateWithinSubjectsConditionPassword() {
    const wsToggle = document.getElementById('within-subjects');
    const conditionInput = document.getElementById('within-subjects-condition');
    const passwordInput = document.getElementById('agent-password');
    if (!wsToggle || !conditionInput || !passwordInput) return;

    const enabled = wsToggle.checked;
    const condition = (conditionInput.value || '').trim();

    if (!enabled || !condition) {
        if (passwordInput.dataset.lockedToCondition === 'true') {
            passwordInput.readOnly = false;
            passwordInput.dataset.lockedToCondition = 'false';
        }
        return;
    }

    try {
        if (_wsPasswordLookupAbortController) {
            _wsPasswordLookupAbortController.abort();
        }
        _wsPasswordLookupAbortController = new AbortController();

        const response = await fetch(`/get-within-subjects-condition-password?condition=${encodeURIComponent(condition)}`, {
            signal: _wsPasswordLookupAbortController.signal
        });
        const data = await response.json();

        if (data && data.password) {
            passwordInput.value = data.password;
            passwordInput.readOnly = true;
            passwordInput.dataset.lockedToCondition = 'true';
        } else {
            passwordInput.readOnly = false;
            passwordInput.dataset.lockedToCondition = 'false';
        }
    } catch (e) {
        if (String(e && e.name) !== 'AbortError') {
            passwordInput.readOnly = false;
            passwordInput.dataset.lockedToCondition = 'false';
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const wsToggle = document.getElementById('within-subjects');
    const counterbalancedToggle = document.getElementById('within-subjects-counterbalanced');
    const conditionInput = document.getElementById('within-subjects-condition');
    if (wsToggle) {
        wsToggle.addEventListener('change', updateWithinSubjectsFields);
    }
    if (counterbalancedToggle) {
        counterbalancedToggle.addEventListener('change', updateWithinSubjectsFields);
    }
    if (conditionInput) {
        conditionInput.addEventListener('input', updateWithinSubjectsConditionPassword);
        conditionInput.addEventListener('blur', updateWithinSubjectsConditionPassword);
    }
    updateWithinSubjectsFields();
});

// Create agent and assign password in one step
function createAgentAndPassword() {
    const DEFAULT_AUTONOMY_INJECTOR_PROMPT = [
        "Continue your immediately previous answer from exactly where it ended.",
        "Rules:",
        "- Output ONLY the continuation text (no \u201cContinuing\u2026\u201d, no preamble, no commentary).",
        "- Do NOT repeat anything you already wrote.",
        "- Keep the same tone, formatting, numbering, and structure.",
        "- If your last message ended mid-sentence, continue that sentence."
    ].join('\n');

    const form = document.getElementById('agent-form');
    const data = new FormData(form);
    const filename = data.get('json-filename').trim();
    const password = data.get('agent-password').trim();
    const autonomyPrompt = (data.get('autonomy_injector_prompt') || '').trim() || DEFAULT_AUTONOMY_INJECTOR_PROMPT;
    const objectionInjectorPrompt = (data.get('objection_injector_prompt') || '').trim();

    if (!filename) {
        showCreationFeedback('Please enter an agent name', 'error');
        return;
    }

    if (!password) {
        showCreationFeedback('Please enter a password for this agent', 'error');
        return;
    }

    if (!data.get('model')) {
        showCreationFeedback('Please select a model', 'error');
        return;
    }

    let modelName = String(data.get('model') || '').trim();
    if (modelName === 'custom') {
        modelName = String(data.get('custom-model') || '').trim();
        if (!modelName) {
            showCreationFeedback('Please enter a custom model name', 'error');
            return;
        }
    }

    const withinSubjectsEnabled = data.get('within-subjects') === 'on';
    const withinSubjectsCondition = (data.get('condition') || '').trim();
    const withinSubjectsCounterbalanced = data.get('counterbalanced') === 'on';
    const withinSubjectsPositionRaw = data.get('within_subjects_position');
    const withinSubjectsPosition = withinSubjectsPositionRaw ? parseInt(withinSubjectsPositionRaw) : 0;

    if (withinSubjectsEnabled && !withinSubjectsCondition) {
        showCreationFeedback('Within-subjects is enabled: please set a condition value.', 'error');
        return;
    }

    if (withinSubjectsEnabled && !withinSubjectsCounterbalanced && ![1, 2].includes(withinSubjectsPosition)) {
        showCreationFeedback('Within-subjects fixed order requires position 1 or 2.', 'error');
        return;
    }

    const autonomyTriggerMin = parseInt(data.get('autonomy_trigger_min_prompts'));
    const autonomyTriggerMax = parseInt(data.get('autonomy_trigger_max_prompts'));
    const autonomyDelayMin = parseFloat(data.get('autonomy_delay_min_seconds'));
    const autonomyDelayMax = parseFloat(data.get('autonomy_delay_max_seconds'));
    const autonomyInjectionsMin = parseInt(data.get('autonomy_injections_min_count'));
    const autonomyInjectionsMax = parseInt(data.get('autonomy_injections_max_count'));

    if (autonomyTriggerMin > autonomyTriggerMax) {
        showCreationFeedback('Autonomy trigger minimum must be less than or equal to maximum.', 'error');
        return;
    }

    if (autonomyDelayMin > autonomyDelayMax) {
        showCreationFeedback('Autonomy delay minimum must be less than or equal to maximum.', 'error');
        return;
    }

    if (autonomyInjectionsMin > autonomyInjectionsMax) {
        showCreationFeedback('Autonomy injections minimum must be less than or equal to maximum.', 'error');
        return;
    }

    if (autonomyInjectionsMin < 1 || autonomyInjectionsMax < 1) {
        showCreationFeedback('Autonomy injection counts must be at least 1.', 'error');
        return;
    }

    const jsonData = {
        "filename": filename,
        "PrePrompt": data.get('PrePrompt'),
        "model": modelName,
        "temperature": parseFloat(data.get('temperature')),
        "top_p": parseFloat(data.get('top_p')),
        "n": parseInt(data.get('n')),
        "presence_penalty": parseFloat(data.get('presence_penalty')),
        "frequency_penalty": parseFloat(data.get('frequency_penalty')),
        "max_completion_tokens": parseInt(data.get('max_completion_tokens')),
        "within-subjects": withinSubjectsEnabled,
        "condition": withinSubjectsCondition,
        "counterbalanced": withinSubjectsCounterbalanced,
        "within_subjects_position": withinSubjectsEnabled && !withinSubjectsCounterbalanced ? withinSubjectsPosition : 0,
        "objection_injector": data.get('objection_injector') === 'on',
        "objection_injector_prompt": objectionInjectorPrompt,
        "autonomy_injector": data.get('autonomy_injector') === 'on',
        "autonomy_trigger_min_prompts": autonomyTriggerMin,
        "autonomy_trigger_max_prompts": autonomyTriggerMax,
        "autonomy_delay_min_seconds": autonomyDelayMin,
        "autonomy_delay_max_seconds": autonomyDelayMax,
        "autonomy_injections_min_count": autonomyInjectionsMin,
        "autonomy_injections_max_count": autonomyInjectionsMax,
        "autonomy_injector_prompt": autonomyPrompt
    };

    const supportsAdvanced = modelSupportsAdvancedParams(modelName);
    if (supportsAdvanced) {
        const reasoningEffort = String(data.get('reasoning_effort') || '').trim();
        if (reasoningEffort) {
            jsonData.reasoning_effort = reasoningEffort;
        }

        const toolChoiceRaw = String(data.get('tool_choice') || '').trim();
        if (toolChoiceRaw) {
            try {
                jsonData.tool_choice = parseJsonOrReturnString(toolChoiceRaw);
            } catch (e) {
                showCreationFeedback('Tool choice must be a valid JSON object/array or a plain string (e.g., auto).', 'error');
                return;
            }
        }

        const toolsRaw = String(data.get('tools_json') || '').trim();
        if (toolsRaw) {
            try {
                const parsedTools = JSON.parse(toolsRaw);
                if (!Array.isArray(parsedTools)) {
                    showCreationFeedback('Tools must be a JSON array (e.g., [{"type":"function", ...}]).', 'error');
                    return;
                }
                jsonData.tools = parsedTools;
            } catch (e) {
                showCreationFeedback('Tools must be valid JSON (array).', 'error');
                return;
            }
        }
    }

    showCreationFeedback('Creating agent...', 'info');
    
    fetch('/create-json', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(jsonData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showCreationFeedback('Agent created! Assigning password...', 'info');
            
            return fetch('/update-passwords', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    password: password,
                    agent: filename
                })
            });
        } else {
            throw new Error(data.error || 'Failed to create agent');
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            const assignedPassword = data.assigned_password || password;
            const forced = !!data.forced;
            showCreationFeedback(
                forced
                    ? `Success! Agent "${filename}" created. Within-subjects condition password enforced as "${assignedPassword}".`
                    : `Success! Agent "${filename}" created and password "${assignedPassword}" assigned.`,
                'success'
            );
            
            // Clear the form
            document.getElementById('agent-form').reset();

            updateAdvancedModelParamsVisibility();
            
            // Refresh the review table
            setTimeout(() => {
                loadAgentsWithStatus();
            }, 1000);
        } else {
            throw new Error(data.error || 'Failed to assign password');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showCreationFeedback(`Error: ${error.message}`, 'error');
    });
}

// Show feedback messages
function showCreationFeedback(message, type = 'info') {
    const feedbackDiv = document.getElementById('creation-feedback');
    if (feedbackDiv) {
        feedbackDiv.innerHTML = `<div class="feedback-${type}">${message}</div>`;
        
        // Clear success/info messages after 5 seconds
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                feedbackDiv.innerHTML = '';
            }, 5000);
        }
    }
}

// Survey Configuration Functions
function toggleSectionExpanded(sectionName) {
    const section = document.querySelector(`[data-section="${sectionName}"] .section-content`);
    const button = document.querySelector(`[data-section="${sectionName}"] .btn-small`);
    
    if (section.classList.contains('expanded')) {
        section.classList.remove('expanded');
        button.textContent = '▶';
    } else {
        section.classList.add('expanded');
        button.textContent = '▼';
    }
}

function addLikertItem() {
    const container = document.getElementById('likert-items');
    const newItem = document.createElement('div');
    newItem.className = 'likert-item';
    newItem.innerHTML = `
        <input type="text" placeholder="Enter statement">
        <button type="button" class="btn-remove" onclick="removeLikertItem(this)">×</button>
    `;
    container.appendChild(newItem);
}

function removeLikertItem(button) {
    button.parentElement.remove();
}

function addFreetextQuestion() {
    const container = document.getElementById('freetext-questions');
    const newQuestion = document.createElement('div');
    newQuestion.className = 'freetext-question';
    newQuestion.innerHTML = `
        <label>Question:</label>
        <input type="text" placeholder="Enter question">
        <label>Text area rows:</label>
        <input type="number" value="4" min="1" max="20" style="width: 60px;">
        <button type="button" class="btn-remove" onclick="removeFreetextQuestion(this)">×</button>
    `;
    container.appendChild(newQuestion);
}

function removeFreetextQuestion(button) {
    button.parentElement.remove();
}

function addCustomDemographicField() {
    const container = document.getElementById('custom-demographic-fields');
    const newField = document.createElement('div');
    newField.className = 'field-config';
    newField.innerHTML = `
        <input type="text" placeholder="Field name" style="width: 150px;">
        <select style="width: 120px;">
            <option value="text">Text Input</option>
            <option value="number">Number</option>
            <option value="select">Dropdown</option>
            <option value="radio">Radio Buttons</option>
            <option value="checkbox">Checkboxes</option>
        </select>
        <input type="text" placeholder="Options (comma-separated)" style="flex: 1;">
        <input type="checkbox"> <label style="margin: 0;">Required</label>
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(newField);
}

function addCustomSection() {
    const container = document.getElementById('custom-sections-container');
    const sectionId = 'custom-' + Date.now();
    const newSection = document.createElement('div');
    newSection.className = 'survey-section-config';
    newSection.setAttribute('data-section', sectionId);
    newSection.innerHTML = `
        <div class="section-header">
            <h4>Custom Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeCustomSection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" placeholder="Custom section title">
            
            <label>Section Description:</label>
            <textarea rows="3" placeholder="Description or instructions for this section"></textarea>
            
            <div class="custom-fields-container">
                <h5>Custom Fields:</h5>
                <div class="custom-fields" id="custom-fields-${sectionId}"></div>
                <button type="button" class="btn-add" onclick="addCustomField('${sectionId}')">+ Add Field</button>
            </div>
        </div>
    `;
    container.appendChild(newSection);
}

function addSurveySection() {
    const sectionType = document.getElementById('section-type-select').value;
    
    if (!sectionType) {
        alert('Please select a section type');
        return;
    }
    
    const container = document.getElementById('dynamic-sections-container');
    const sectionId = sectionType + '-' + Date.now();
    
    let sectionHTML = '';
    
    switch (sectionType) {
        case 'demographics':
            sectionHTML = createDemographicsSection(sectionId);
            break;
        case 'likert':
            sectionHTML = createLikertSection(sectionId);
            break;
        case 'freetext':
            sectionHTML = createFreetextSection(sectionId);
            break;
        case 'checkbox':
            sectionHTML = createCheckboxSection(sectionId);
            break;
        case 'dropdown':
            sectionHTML = createDropdownSection(sectionId);
            break;
        case 'slider':
            sectionHTML = createSliderSection(sectionId);
            break;
        case 'image':
            sectionHTML = createImageSection(sectionId);
            break;
        case 'video':
            sectionHTML = createVideoSection(sectionId);
            break;
        case 'pdf':
            sectionHTML = createPDFSection(sectionId);
            break;
        case 'custom':
            sectionHTML = createCustomSection(sectionId);
            break;
    }
    
    const newSection = document.createElement('div');
    newSection.className = 'survey-section-config';
    newSection.setAttribute('data-section', sectionId);
    newSection.innerHTML = sectionHTML;
    container.appendChild(newSection);
    
    // Initialize any special functionality for the new section
    if (sectionType === 'likert') {
        // This is to make sure the new Likert types work in the new section
        const scaleSelect = newSection.querySelector('.likert-scale-type');
        if (scaleSelect) {
            scaleSelect.addEventListener('change', function() {
                updateLikertLabelsForSection(sectionId);
            });
        }
    }
    
    // Initialize response toggles for media sections
    if (['image', 'video', 'pdf'].includes(sectionType)) {
        const responseCheckbox = newSection.querySelector(`#require-response-${sectionId}`);
        const responseConfig = newSection.querySelector('.response-config');
        
        if (responseCheckbox && responseConfig) {
            responseCheckbox.addEventListener('change', function() {
                responseConfig.style.display = this.checked ? 'block' : 'none';
            });
        }
    }
}

// These are all the functions to create the different section types
function createDemographicsSection(sectionId) {
    return `
        <div class="section-header">
            <h4>Demographics Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" value="Demographics" placeholder="Section title">
            
            <div class="demographics-fields">
                <div class="field-config">
                    <input type="checkbox" checked>
                    <label>Age Field</label>
                    <input type="number" value="18" placeholder="Min" style="width: 60px;">
                    <input type="number" value="99" placeholder="Max" style="width: 60px;">
                    <input type="text" class="column-label-input" data-field="age" placeholder="Column label (hidden from participant)" style="width: 260px;">
                </div>
                
                <div class="field-config">
                    <input type="checkbox" checked>
                    <label>Gender Field</label>
                    <div class="gender-options">
                        <input type="text" value="Female,Male,Other,Prefer not to say" placeholder="Comma-separated options">
                    </div>
                    <input type="text" class="column-label-input" data-field="gender" placeholder="Column label (hidden from participant)" style="width: 260px;">
                </div>
                
                <button type="button" class="btn-add" onclick="addCustomDemographicFieldToSection('${sectionId}')">+ Add Custom Field</button>
                <div id="custom-demographic-fields-${sectionId}"></div>
            </div>
        </div>
    `;
}

function createLikertSection(sectionId) {
    const itemId1 = generateInternalId('likert');
    const itemId2 = generateInternalId('likert');
    return `
        <div class="section-header">
            <h4>Likert Scale Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <div style="background-color: #222; border-left: 4px solid #f0f8ff; padding: 8px; margin-bottom: 15px; font-size: 12px; color: #f0f8ff;">
                <strong>Important:</strong> You must select a Scale Type for survey programming.
            </div>
            
            <label>Section Title:</label>
            <input type="text" value="Likert Scale Items" placeholder="Section title">
            
            <div class="likert-scale-config">
                <label>Scale Type:</label>
                <select class="likert-scale-type" onchange="updateLikertLabelsForSection('${sectionId}')">
                    <option value="5-point-agreement">5-Point Agreement (Strongly Disagree to Strongly Agree)</option>
                    <option value="5-point-frequency">5-Point Frequency (Never to Always)</option>
                    <option value="7-point-agreement">7-Point Agreement</option>
                    <option value="custom">Custom Scale</option>
                </select>
                
                <div class="custom-scale-labels" style="display: none;">
                    <label>Scale Labels (comma-separated):</label>
                    <input type="text" class="scale-labels" placeholder="e.g., Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree">
                </div>
            </div>
            
            <div class="likert-items-container">
                <h5>Likert Items:</h5>
                <div class="likert-items" id="likert-items-${sectionId}">
                    <div class="likert-item" data-item-id="${itemId1}">
                        <input type="text" class="likert-statement-input" value="I enjoy using technology." placeholder="Enter statement">
                        <input type="text" class="column-label-input" placeholder="Column label (hidden from participant)" style="width: 260px;">
                        <button type="button" class="btn-remove" onclick="removeLikertItem(this)">×</button>
                    </div>
                    <div class="likert-item" data-item-id="${itemId2}">
                        <input type="text" class="likert-statement-input" value="I feel comfortable sharing my opinions online." placeholder="Enter statement">
                        <input type="text" class="column-label-input" placeholder="Column label (hidden from participant)" style="width: 260px;">
                        <button type="button" class="btn-remove" onclick="removeLikertItem(this)">×</button>
                    </div>
                </div>
                <button type="button" class="btn-add" onclick="addLikertItemToSection('${sectionId}')">+ Add Item</button>
            </div>
        </div>
    `;
}

function createFreetextSection(sectionId) {
    const questionId1 = generateInternalId('freetext');
    return `
        <div class="section-header">
            <h4>Free Text Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" value="Free Form Text" placeholder="Section title">
            
            <div class="freetext-questions" id="freetext-questions-${sectionId}">
                <div class="freetext-question" data-question-id="${questionId1}">
                    <label>Question:</label>
                    <input type="text" class="freetext-question-input" value="Please describe your experience with online surveys:" placeholder="Enter question">
                    <label>Column label (hidden from participant):</label>
                    <input type="text" class="column-label-input" placeholder="e.g., exp_online_surveys">
                    <label>Text area rows:</label>
                    <input type="number" class="freetext-rows-input" value="4" min="1" max="20" style="width: 60px;">
                    <button type="button" class="btn-remove" onclick="removeFreetextQuestion(this)">×</button>
                </div>
            </div>
            <button type="button" class="btn-add" onclick="addFreetextQuestionToSection('${sectionId}')">+ Add Question</button>
        </div>
    `;
}

function createCustomSection(sectionId) {
    return `
        <div class="section-header">
            <h4>Custom Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" placeholder="Custom section title">
            
            <label>Section Description:</label>
            <textarea rows="3" placeholder="Description or instructions for this section"></textarea>
            
            <div class="custom-fields-container">
                <h5>Custom Fields:</h5>
                <div class="custom-fields" id="custom-fields-${sectionId}"></div>
                <button type="button" class="btn-add" onclick="addCustomFieldToSection('${sectionId}')">+ Add Field</button>
            </div>
        </div>
    `;
}

function createCheckboxSection(sectionId) {
    return `
        <div class="section-header">
            <h4>Multiple Choice Checkboxes</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" value="Multiple Choice Selection" placeholder="Section title">
            
            <label>Question/Instructions:</label>
            <input type="text" value="Please select all that apply:" placeholder="Question or instructions">

            <label>Column Label (hidden from participant):</label>
            <input type="text" class="column-label-input" placeholder="e.g., checkbox_${sectionId}_response">
            
            <div class="checkbox-options-container">
                <h5>Checkbox Options:</h5>
                <div class="checkbox-options" id="checkbox-options-${sectionId}">
                    <div class="option-item">
                        <input type="text" placeholder="Option 1" value="Option 1">
                        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
                    </div>
                    <div class="option-item">
                        <input type="text" placeholder="Option 2" value="Option 2">
                        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
                    </div>
                </div>
                <button type="button" class="btn-add" onclick="addCheckboxOption('${sectionId}')">+ Add Option</button>
            </div>
        </div>
    `;
}

function createDropdownSection(sectionId) {
    return `
        <div class="section-header">
            <h4>Dropdown Selection</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" value="Selection" placeholder="Section title">
            
            <label>Question/Instructions:</label>
            <input type="text" value="Please select an option:" placeholder="Question or instructions">

            <label>Column Label (hidden from participant):</label>
            <input type="text" class="column-label-input" placeholder="e.g., dropdown_${sectionId}_response">
            
            <label>Required:</label>
            <input type="checkbox" checked>
            
            <div class="dropdown-options-container">
                <h5>Dropdown Options:</h5>
                <div class="dropdown-options" id="dropdown-options-${sectionId}">
                    <div class="option-item">
                        <input type="text" placeholder="Option 1" value="Option 1">
                        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
                    </div>
                    <div class="option-item">
                        <input type="text" placeholder="Option 2" value="Option 2">
                        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
                    </div>
                </div>
                <button type="button" class="btn-add" onclick="addDropdownOption('${sectionId}')">+ Add Option</button>
            </div>
        </div>
    `;
}

function createSliderSection(sectionId) {
    return `
        <div class="section-header">
            <h4>Slider Scale</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            
            <label>Section Title:</label>
            <input type="text" value="Rating Scale" placeholder="Section title">
            
            <label>Question/Instructions:</label>
            <input type="text" value="Please rate using the slider:" placeholder="Question or instructions">

            <label>Column Label (hidden from participant):</label>
            <input type="text" class="column-label-input" placeholder="e.g., slider_${sectionId}_response">
            
            <label>Required:</label>
            <input type="checkbox" checked>
            
            <div class="slider-type-container">
                <h5>Slider Type:</h5>
                <label><input type="radio" name="slider-type-${sectionId}" value="labels" checked onchange="updateSliderConfig('${sectionId}')"> Label-based (Left/Right labels)</label><br>
                <label><input type="radio" name="slider-type-${sectionId}" value="numeric" onchange="updateSliderConfig('${sectionId}')"> Numeric scale</label>
            </div>
            <br>
            <div class="slider-config" id="slider-config-${sectionId}">
                <div class="label-config">
                    <label>Left Label:</label>
                    <input type="text" value="Strongly Disagree" placeholder="Left label">
                    
                    <label>Right Label:</label>
                    <input type="text" value="Strongly Agree" placeholder="Right label">
                    
                    <label>Number of Steps:</label>
                    <input type="number" value="7" min="2" max="20">
                    
                    <label>Default Value:</label>
                    <input type="number" value="4" min="1">
                </div>
                
                <div class="numeric-config" style="display: none;">
                    <label>Minimum Value:</label>
                    <input type="number" value="0">
                    
                    <label>Maximum Value:</label>
                    <input type="number" value="100">
                    
                    <label>Default Value:</label>
                    <input type="number" value="50">
                </div>
            </div>
        </div>
    `;
}

function removeSurveySection(sectionId) {
    document.querySelector(`[data-section="${sectionId}"]`).remove();
}

function createImageSection(sectionId) {
    return `
        <div class="section-header">
            <h4>Image Display Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" value="Image Display" placeholder="Section title">
            
            <label>Description/Instructions:</label>
            <textarea rows="3" placeholder="Instructions or description for participants"></textarea>
            
            <div class="image-config">
                <h5>Image Configuration:</h5>
                
                <div class="file-upload-section">
                    <label for="image-upload-${sectionId}">Upload Image:</label>
                    <input type="file" id="image-upload-${sectionId}" name="image-file" accept=".jpg,.jpeg,.png,.gif,.webp" onchange="handleImageUpload('${sectionId}')">
                    <div id="image-file-status-${sectionId}" class="file-status"></div>
                </div>
                
                <div class="image-display-options">
                    <label>Display Size:</label>
                    <select>
                        <option value="small">Small (300px)</option>
                        <option value="medium" selected>Medium (500px)</option>
                        <option value="large">Large (700px)</option>
                        <option value="full">Full Width</option>
                    </select>
                    
                    <label>Alignment:</label>
                    <select>
                        <option value="left">Left</option>
                        <option value="center" selected>Center</option>
                        <option value="right">Right</option>
                    </select>
                </div>
                
                <div class="image-alt-text">
                    <label>Alt Text:</label>
                    <input type="text" placeholder="Description of the image for screen readers">
                </div>
                
                <div class="response-options">
                    <input type="checkbox" id="require-response-${sectionId}">
                    <label for="require-response-${sectionId}">Require participant response about this image</label>
                    
                    <div class="response-config" style="display: none;">
                        <label>Response Type:</label>
                        <select onchange="toggleImageResponseType('${sectionId}', this.value)">
                            <option value="rating">Rating Scale</option>
                            <option value="text">Text Response</option>
                            <option value="checkbox">Checkbox Options</option>
                        </select>
                        
                        <div class="response-details" id="image-response-details-${sectionId}">
                            <label>Rating Question:</label>
                            <input type="text" class="js-rating-question" value="How would you rate this image?" placeholder="Rating question">
                            <label>Scale (1-10):</label>
                            <input type="number" class="js-rating-scale" value="10" min="2" max="20">
                            <label>Column Label (hidden from participant):</label>
                            <input type="text" class="js-rating-column-label column-label-input" placeholder="e.g., image_${sectionId}_rating">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createVideoSection(sectionId) {
    return `
        <div class="section-header">
            <h4>Video Display Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" value="Video Display" placeholder="Section title">
            
            <label>Description/Instructions:</label>
            <textarea rows="3" placeholder="Instructions or description for participants"></textarea>
            
            <div class="video-config">
                <h5>Video Configuration:</h5>
                
                <div class="video-source-options">
                    <label>Video Source:</label>
                    <select onchange="toggleVideoSourceType('${sectionId}', this.value)">
                        <option value="upload">Upload Video File</option>
                        <option value="url">Video URL (YouTube, Vimeo, etc.)</option>
                    </select>
                </div>
                
                <div class="file-upload-section" id="video-upload-section-${sectionId}">
                    <label for="video-upload-${sectionId}">Upload Video:</label>
                    <input type="file" id="video-upload-${sectionId}" name="video-file" accept=".mp4,.webm,.ogg,.avi,.mov" onchange="handleVideoUpload('${sectionId}')">
                    <div id="video-file-status-${sectionId}" class="file-status"></div>
                </div>
                
                <div class="video-url-section" id="video-url-section-${sectionId}" style="display: none;">
                    <label>Video URL:</label>
                    <input type="url" placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/...">
                    <small>Supports YouTube, Vimeo, and direct video file URLs</small>
                </div>
                
                <div class="video-display-options">
                    <label>Video Size:</label>
                    <select>
                        <option value="small">Small (400x300)</option>
                        <option value="medium" selected>Medium (640x480)</option>
                        <option value="large">Large (800x600)</option>
                        <option value="responsive">Responsive (Full Width)</option>
                    </select>
                    
                    <div class="video-controls">
                        <input type="checkbox" id="autoplay-${sectionId}">
                        <label for="autoplay-${sectionId}">Autoplay</label>
                        
                        <input type="checkbox" id="controls-${sectionId}" checked>
                        <label for="controls-${sectionId}">Show Controls</label>
                        
                        <input type="checkbox" id="loop-${sectionId}">
                        <label for="loop-${sectionId}">Loop</label>
                    </div>
                </div>
                
                <div class="response-options">
                    <input type="checkbox" id="require-response-${sectionId}">
                    <label for="require-response-${sectionId}">Require participant response about this video</label>
                    
                    <div class="response-config" style="display: none;">
                        <label>Response Type:</label>
                        <select onchange="toggleVideoResponseType('${sectionId}', this.value)">
                            <option value="rating">Rating Scale</option>
                            <option value="text">Text Response</option>
                            <option value="checkbox">Checkbox Options</option>
                        </select>
                        
                        <div class="response-details" id="video-response-details-${sectionId}">
                            <label>Rating Question:</label>
                            <input type="text" class="js-rating-question" value="How would you rate this video?" placeholder="Rating question">
                            <label>Scale (1-10):</label>
                            <input type="number" class="js-rating-scale" value="10" min="2" max="20">
                            <label>Column Label (hidden from participant):</label>
                            <input type="text" class="js-rating-column-label column-label-input" placeholder="e.g., video_${sectionId}_rating">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createPDFSection(sectionId) {
    return `
        <div class="section-header">
            <h4>PDF Display Section</h4>
            <div class="section-controls">
                <input type="checkbox" id="enable-${sectionId}" checked>
                <label for="enable-${sectionId}">Enable</label>
                <button type="button" class="btn-small" onclick="toggleSectionExpanded('${sectionId}')">▼</button>
                <button type="button" class="btn-remove" onclick="removeSurveySection('${sectionId}')">×</button>
            </div>
        </div>
        <div class="section-content expanded">
            <label>Section Title:</label>
            <input type="text" value="PDF Display" placeholder="Section title">
            
            <label>Description/Instructions:</label>
            <textarea rows="3" placeholder="Instructions or description for participants"></textarea>
            
            <div class="pdf-config">
                <h5>PDF Configuration:</h5>
                
                <div class="file-upload-section">
                    <label for="pdf-upload-${sectionId}">Upload PDF:</label>
                    <input type="file" id="pdf-upload-${sectionId}" name="pdf-file" accept=".pdf" onchange="handlePDFUpload('${sectionId}')">
                    <div id="pdf-file-status-${sectionId}" class="file-status"></div>
                </div>
                
                <div class="pdf-display-options">
                    <label>Display Height:</label>
                    <select>
                        <option value="400">Small (400px)</option>
                        <option value="600" selected>Medium (600px)</option>
                        <option value="800">Large (800px)</option>
                        <option value="auto">Auto Height</option>
                    </select>
                    
                    <label>Display Mode:</label>
                    <select>
                        <option value="embed" selected>Embedded Viewer</option>
                        <option value="link">Download Link</option>
                        <option value="both">Both Embedded + Download</option>
                    </select>
                </div>
                
                <div class="pdf-options">
                    <input type="checkbox" id="allow-download-${sectionId}" checked>
                    <label for="allow-download-${sectionId}">Allow participants to download PDF</label>
                    
                    <input type="checkbox" id="require-view-${sectionId}">
                    <label for="require-view-${sectionId}">Require participants to view PDF before proceeding</label>
                </div>
                
                <div class="response-options">
                    <input type="checkbox" id="require-response-${sectionId}">
                    <label for="require-response-${sectionId}">Require participant response about this PDF</label>
                    
                    <div class="response-config" style="display: none;">
                        <label>Response Type:</label>
                        <select onchange="togglePDFResponseType('${sectionId}', this.value)">
                            <option value="confirmation">Confirmation (I have read this document)</option>
                            <option value="rating">Rating Scale</option>
                            <option value="text">Text Response</option>
                            <option value="checkbox">Checkbox Options</option>
                        </select>
                        
                        <div class="response-details" id="pdf-response-details-${sectionId}">
                            <label>Confirmation Text:</label>
                            <input type="text" class="js-confirmation-text" value="I have read and understood the document" placeholder="Confirmation text">
                            <label>Column Label (hidden from participant):</label>
                            <input type="text" class="js-confirmation-column-label column-label-input" placeholder="e.g., pdf_${sectionId}_confirmed">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function removeCustomSection(sectionId) {
    document.querySelector(`[data-section="${sectionId}"]`).remove();
}

function addCustomDemographicFieldToSection(sectionId) {
    const container = document.getElementById(`custom-demographic-fields-${sectionId}`);
    const newField = document.createElement('div');
    newField.className = 'field-config';
    newField.innerHTML = `
        <input type="text" placeholder="Field name" style="width: 150px;">
        <select style="width: 120px;">
            <option value="text">Text Input</option>
            <option value="number">Number</option>
            <option value="select">Dropdown</option>
            <option value="radio">Radio Buttons</option>
            <option value="checkbox">Checkboxes</option>
        </select>
        <input type="text" placeholder="Options (comma-separated)" style="flex: 1;">
        <input type="checkbox"> <label style="margin: 0;">Required</label>
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(newField);
}

function addLikertItemToSection(sectionId) {
    const container = document.getElementById(`likert-items-${sectionId}`);
    const itemId = generateInternalId('likert');
    const newItem = document.createElement('div');
    newItem.className = 'likert-item';
    newItem.setAttribute('data-item-id', itemId);
    newItem.innerHTML = `
        <input type="text" class="likert-statement-input" placeholder="Enter statement">
        <input type="text" class="column-label-input" placeholder="Column label (hidden from participant)" style="width: 260px;">
        <button type="button" class="btn-remove" onclick="removeLikertItem(this)">×</button>
    `;
    container.appendChild(newItem);
}

function addFreetextQuestionToSection(sectionId) {
    const container = document.getElementById(`freetext-questions-${sectionId}`);
    const questionId = generateInternalId('freetext');
    const newQuestion = document.createElement('div');
    newQuestion.className = 'freetext-question';
    newQuestion.setAttribute('data-question-id', questionId);
    newQuestion.innerHTML = `
        <label>Question:</label>
        <input type="text" class="freetext-question-input" placeholder="Enter question">
        <label>Column label (hidden from participant):</label>
        <input type="text" class="column-label-input" placeholder="e.g., my_column_label">
        <label>Text area rows:</label>
        <input type="number" class="freetext-rows-input" value="4" min="1" max="20" style="width: 60px;">
        <button type="button" class="btn-remove" onclick="removeFreetextQuestion(this)">×</button>
    `;
    container.appendChild(newQuestion);
}

function addCustomFieldToSection(sectionId) {
    const container = document.getElementById(`custom-fields-${sectionId}`);
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'field-config';
    fieldDiv.innerHTML = `
        <input type="text" class="js-custom-label" placeholder="Field label" style="width: 200px;">
        <select style="width: 120px;">
            <option value="text">Text Input</option>
            <option value="textarea">Text Area</option>
            <option value="number">Number</option>
            <option value="email">Email</option>
            <option value="select">Dropdown</option>
            <option value="radio">Radio Buttons</option>
            <option value="checkbox">Checkboxes</option>
            <option value="likert">Likert Scale</option>
        </select>
        <input type="text" class="js-custom-options" placeholder="Options/validation" style="flex: 1;">
        <input type="text" class="js-custom-column-label column-label-input" placeholder="Column label (hidden from participant)" style="width: 220px;">
        <input type="checkbox"> <label style="margin: 0;">Required</label>
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(fieldDiv);
}

// Checkbox function for new section types
function addCheckboxOption(sectionId) {
    const container = document.getElementById(`checkbox-options-${sectionId}`);
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    const optionCount = container.children.length + 1;
    optionDiv.innerHTML = `
        <input type="text" placeholder="Option ${optionCount}" value="Option ${optionCount}">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(optionDiv);
}

function addDropdownOption(sectionId) {
    const container = document.getElementById(`dropdown-options-${sectionId}`);
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    const optionCount = container.children.length + 1;
    optionDiv.innerHTML = `
        <input type="text" placeholder="Option ${optionCount}" value="Option ${optionCount}">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(optionDiv);
}

function updateSliderConfig(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const sliderType = section.querySelector(`input[name="slider-type-${sectionId}"]:checked`).value;
    const labelConfig = section.querySelector('.label-config');
    const numericConfig = section.querySelector('.numeric-config');
    
    if (sliderType === 'labels') {
        labelConfig.style.display = 'block';
        numericConfig.style.display = 'none';
    } else {
        labelConfig.style.display = 'none';
        numericConfig.style.display = 'block';
    }
}

function updateLikertLabelsForSection(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const scaleSelect = section.querySelector('.likert-scale-type');
    const customLabels = section.querySelector('.custom-scale-labels');
    const scaleLabelsInput = section.querySelector('.scale-labels');
    
    const scaleType = scaleSelect.value;
    
    if (scaleType === 'custom') {
        customLabels.style.display = 'block';
    } else {
        customLabels.style.display = 'none';

        // These are the predefined labels
        const labelSets = {
            '5-point-agreement': 'Strongly Disagree,Disagree,Neutral,Agree,Strongly Agree',
            '5-point-frequency': 'Never,Rarely,Sometimes,Often,Always',
            '7-point-agreement': 'Strongly Disagree,Disagree,Somewhat Disagree,Neutral,Somewhat Agree,Agree,Strongly Agree'
        };
        
        if (labelSets[scaleType]) {
            scaleLabelsInput.value = labelSets[scaleType];
        }
    }
}

function addCustomField(sectionId) {
    const container = document.getElementById(`custom-fields-${sectionId}`);
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'field-config';
    fieldDiv.innerHTML = `
        <input type="text" placeholder="Field label" style="width: 200px;">
        <select style="width: 120px;">
            <option value="text">Text Input</option>
            <option value="textarea">Text Area</option>
            <option value="number">Number</option>
            <option value="email">Email</option>
            <option value="select">Dropdown</option>
            <option value="radio">Radio Buttons</option>
            <option value="checkbox">Checkboxes</option>
            <option value="likert">Likert Scale</option>
        </select>
        <input type="text" placeholder="Options/validation" style="flex: 1;">
        <input type="checkbox"> <label style="margin: 0;">Required</label>
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(fieldDiv);
}

function updateLikertLabels() {
    const scaleType = document.getElementById('likert-scale-type').value;
    const customLabels = document.getElementById('custom-scale-labels');
    const scaleLabelsInput = document.getElementById('scale-labels');
    
    if (scaleType === 'custom') {
        customLabels.style.display = 'block';
    } else {
        customLabels.style.display = 'none';
        
        // More predefined labels can be added here
        const labelSets = {
            '5-point-agreement': 'Strongly Disagree,Disagree,Neutral,Agree,Strongly Agree',
            '5-point-frequency': 'Never,Rarely,Sometimes,Often,Always',
            '7-point-agreement': 'Strongly Disagree,Disagree,Somewhat Disagree,Neutral,Somewhat Agree,Agree,Strongly Agree'
        };
        
        if (labelSets[scaleType]) {
            scaleLabelsInput.value = labelSets[scaleType];
        }
    }
}

function handleFileUpload(type) {
    const fileInput = document.getElementById(`${type}-file`);
    const statusDiv = document.getElementById(`${type}-file-status`);
    const file = fileInput.files[0];
    
    if (file) {
        statusDiv.innerHTML = '';
        
        // Validate file type
        if (file.type !== 'application/pdf') {
            statusDiv.innerHTML = `<span class="file-status error">✗ Please select a PDF file</span>`;
            fileInput.value = '';
            return;
        }
        
        // Validate file size
        if (file.size > 10 * 1024 * 1024) {
            statusDiv.innerHTML = `<span class="file-status error">✗ File too large</span>`;
            fileInput.value = '';
            return;
        }
        
        // uploading status
        statusDiv.innerHTML = `<span class="file-status"> Uploading ${file.name}...</span>`;
        
        // Upload the file
        uploadFormFile(file, type);
    }
}

function uploadFormFile(file, type) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    
    fetch('/upload-form-file', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        const statusDiv = document.getElementById(`${type}-file-status`);
        if (data.success) {
            statusDiv.innerHTML = 
                `<span class="file-status success">✓ File uploaded successfully - will be available for download in survey</span>`;
        } else {
            statusDiv.innerHTML = 
                `<span class="file-status error">✗ Upload failed: ${data.error}</span>`;
            document.getElementById(`${type}-file`).value = '';
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        document.getElementById(`${type}-file-status`).innerHTML = 
            `<span class="file-status error">✗ Upload failed - please try again</span>`;
        document.getElementById(`${type}-file`).value = '';
    });
}

function saveSurveyConfiguration() {
    const config = collectSurveyConfiguration();
    
    // Validate configuration before saving
    const validationError = validateSurveyConfiguration(config);
    if (validationError) {
        showFeedback('survey-feedback', validationError, 'error');
        return;
    }
    
    fetch('/save-survey-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showFeedback('survey-feedback', 'Survey configuration saved successfully!', 'success');
        } else {
            showFeedback('survey-feedback', 'Error saving configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showFeedback('survey-feedback', 'Error saving configuration', 'error');
    });
}

function collectSurveyConfiguration() {
    const config = {
        title: document.getElementById('survey-title').value,
        information: {
            title: document.getElementById('information-title').value,
            content: document.getElementById('information-content').value
        },
        consent: {
            content: document.getElementById('consent-content').value
        },
        settings: {
            showProgress: document.getElementById('show-progress').checked,
            randomizeSections: document.getElementById('randomize-sections').checked,
            randomizeItems: document.getElementById('randomize-items').checked,
            completionMessage: document.getElementById('completion-message').value
        },
        sections: {}
    };
    
    // Collect configuration from all dynamic sections
    const dynamicSections = document.querySelectorAll('#dynamic-sections-container .survey-section-config');
    
    dynamicSections.forEach(sectionElement => {
        const sectionId = sectionElement.getAttribute('data-section');
        const enableCheckbox = sectionElement.querySelector(`#enable-${sectionId}`);
        
        // Skip if section is not enabled
        if (!enableCheckbox || !enableCheckbox.checked) {
            return;
        }
        
        const sectionType = sectionId.split('-')[0];
        const titleInput = sectionElement.querySelector('.section-content > input[type="text"]') || sectionElement.querySelector('input[type="text"]');
        
        if (sectionType === 'demographics') {
            const ageCheckbox = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="checkbox"]');
            const genderCheckbox = sectionElement.querySelector('.demographics-fields .field-config:nth-child(2) input[type="checkbox"]');
            const ageMinInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:first-of-type');
            const ageMaxInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:last-of-type');
            const genderOptionsInput = sectionElement.querySelector('.gender-options input[type="text"]');
            
            const ageColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="age"]');
            const genderColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="gender"]');

            config.sections[sectionId] = {
                type: 'demographics',
                enabled: true,
                title: titleInput ? titleInput.value : 'Demographics',
                fields: {
                    age: {
                        enabled: ageCheckbox ? ageCheckbox.checked : false,
                        min: ageMinInput ? ageMinInput.value : '18',
                        max: ageMaxInput ? ageMaxInput.value : '99',
                        column_label: ageColumnLabelInput ? ageColumnLabelInput.value.trim() : ''
                    },
                    gender: {
                        enabled: genderCheckbox ? genderCheckbox.checked : false,
                        options: genderOptionsInput ? genderOptionsInput.value.split(',').map(s => s.trim()) : [],
                        column_label: genderColumnLabelInput ? genderColumnLabelInput.value.trim() : ''
                    }
                }
            };
        } else if (sectionType === 'likert') {
            const likertItems = [];
            const scaleTypeSelect = sectionElement.querySelector('.likert-scale-type');
            const scaleLabelsInput = sectionElement.querySelector('.scale-labels');

            sectionElement.querySelectorAll('.likert-items .likert-item').forEach(itemDiv => {
                const statementInput = itemDiv.querySelector('.likert-statement-input') || itemDiv.querySelector('input[type="text"]');
                const columnLabelInput = itemDiv.querySelector('.column-label-input');
                const statement = statementInput ? statementInput.value.trim() : '';
                if (!statement) return;
                const itemId = itemDiv.getAttribute('data-item-id') || generateInternalId('likert');
                likertItems.push({
                    id: itemId,
                    statement: statement,
                    column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                });
            });
            
            config.sections[sectionId] = {
                type: 'likert',
                enabled: true,
                title: titleInput ? titleInput.value : 'Likert Scale Items',
                scaleType: scaleTypeSelect ? scaleTypeSelect.value : '5-point-agreement',
                scaleLabels: scaleLabelsInput ? scaleLabelsInput.value : '',
                items: likertItems
            };
        } else if (sectionType === 'freetext') {
            const freetextQuestions = [];
            
            sectionElement.querySelectorAll('.freetext-questions .freetext-question').forEach(questionDiv => {
                const questionInput = questionDiv.querySelector('.freetext-question-input') || questionDiv.querySelector('input[type="text"]');
                const columnLabelInput = questionDiv.querySelector('.column-label-input');
                const rowsInput = questionDiv.querySelector('.freetext-rows-input') || questionDiv.querySelector('input[type="number"]');
                const questionText = questionInput ? questionInput.value.trim() : '';
                const rows = rowsInput ? rowsInput.value : '';
                if (questionText) {
                    const questionId = questionDiv.getAttribute('data-question-id') || generateInternalId('freetext');
                    freetextQuestions.push({
                        id: questionId,
                        question: questionText,
                        rows: parseInt(rows) || 4,
                        column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                    });
                }
            });
            
            config.sections[sectionId] = {
                type: 'freetext',
                enabled: true,
                title: titleInput ? titleInput.value : 'Free Form Text',
                questions: freetextQuestions
            };
        } else if (sectionType === 'custom') {
            const customFields = [];
            const descriptionTextarea = sectionElement.querySelector('textarea');
            
            sectionElement.querySelectorAll('.custom-fields .field-config').forEach(fieldDiv => {
                const labelInput = fieldDiv.querySelector('.js-custom-label') || fieldDiv.querySelector('input[type="text"]:first-of-type');
                const typeSelect = fieldDiv.querySelector('select');
                const optionsInput = fieldDiv.querySelector('.js-custom-options') || fieldDiv.querySelectorAll('input[type="text"]')[1];
                const requiredCheckbox = fieldDiv.querySelector('input[type="checkbox"]');
                const columnLabelInput = fieldDiv.querySelector('.js-custom-column-label') || fieldDiv.querySelector('.column-label-input');
                
                if (labelInput && labelInput.value.trim()) {
                    customFields.push({
                        label: labelInput.value.trim(),
                        type: typeSelect ? typeSelect.value : 'text',
                        options: optionsInput ? optionsInput.value : '',
                        required: requiredCheckbox ? requiredCheckbox.checked : false,
                        column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                    });
                }
            });
            
            config.sections[sectionId] = {
                type: 'custom',
                enabled: true,
                title: titleInput ? titleInput.value : 'Custom Section',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                fields: customFields
            };
        } else if (sectionType === 'checkbox') {
            const options = [];
            const sectionTextInputs = sectionElement.querySelectorAll('.section-content > input[type="text"]');
            const questionInput = sectionTextInputs[1];
            const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
            
            sectionElement.querySelectorAll('.checkbox-options .option-item input[type="text"]').forEach(input => {
                if (input.value.trim()) {
                    options.push(input.value.trim());
                }
            });
            
            config.sections[sectionId] = {
                type: 'checkbox',
                enabled: true,
                title: titleInput ? titleInput.value : 'Multiple Choice Selection',
                question: questionInput ? questionInput.value : 'Please select all that apply:',
                options: options,
                column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
            };
        } else if (sectionType === 'dropdown') {
            const options = [];
            const sectionTextInputs = sectionElement.querySelectorAll('.section-content > input[type="text"]');
            const questionInput = sectionTextInputs[1];
            const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
            const requiredCheckbox = sectionElement.querySelector('.section-content > input[type="checkbox"]');
            
            sectionElement.querySelectorAll('.dropdown-options .option-item input[type="text"]').forEach(input => {
                if (input.value.trim()) {
                    options.push(input.value.trim());
                }
            });
            
            config.sections[sectionId] = {
                type: 'dropdown',
                enabled: true,
                title: titleInput ? titleInput.value : 'Selection',
                question: questionInput ? questionInput.value : 'Please select an option:',
                required: requiredCheckbox ? requiredCheckbox.checked : false,
                options: options,
                column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
            };
        } else if (sectionType === 'slider') {
            const sectionTextInputs = sectionElement.querySelectorAll('.section-content > input[type="text"]');
            const questionInput = sectionTextInputs[1];
            const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
            const requiredCheckbox = sectionElement.querySelector('.section-content > input[type="checkbox"]');
            const sliderTypeRadio = sectionElement.querySelector(`input[name="slider-type-${sectionId}"]:checked`);
            const sliderType = sliderTypeRadio ? sliderTypeRadio.value : 'labels';
            
            let sliderConfig = {
                type: 'slider',
                enabled: true,
                title: titleInput ? titleInput.value : 'Rating Scale',
                question: questionInput ? questionInput.value : 'Please rate using the slider:',
                required: requiredCheckbox ? requiredCheckbox.checked : false,
                slider_type: sliderType,
                column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
            };
            
            if (sliderType === 'labels') {
                const labelInputs = sectionElement.querySelectorAll('.label-config input[type="text"]');
                const stepInput = sectionElement.querySelector('.label-config input[type="number"]:nth-of-type(1)');
                const defaultInput = sectionElement.querySelector('.label-config input[type="number"]:nth-of-type(2)');
                
                sliderConfig.left_label = labelInputs[0] ? labelInputs[0].value : 'Strongly Disagree';
                sliderConfig.right_label = labelInputs[1] ? labelInputs[1].value : 'Strongly Agree';
                sliderConfig.steps = stepInput ? parseInt(stepInput.value) : 7;
                sliderConfig.default_value = defaultInput ? parseInt(defaultInput.value) : 4;
            } else {
                const numericInputs = sectionElement.querySelectorAll('.numeric-config input[type="number"]');
                
                sliderConfig.min_value = numericInputs[0] ? parseInt(numericInputs[0].value) : 0;
                sliderConfig.max_value = numericInputs[1] ? parseInt(numericInputs[1].value) : 100;
                sliderConfig.default_value = numericInputs[2] ? parseInt(numericInputs[2].value) : 50;
            }
            
            config.sections[sectionId] = sliderConfig;
        } else if (sectionType === 'image') {
            const descriptionTextarea = sectionElement.querySelector('textarea');
            const fileInput = sectionElement.querySelector(`#image-upload-${sectionId}`);
            const altTextInput = sectionElement.querySelector('.image-alt-text input[type="text"]');
            const displaySizeSelect = sectionElement.querySelectorAll('select')[0];
            const alignmentSelect = sectionElement.querySelectorAll('select')[1];
            const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
            const responseTypeSelect = sectionElement.querySelector('.response-config select');
            
            let imageConfig = {
                type: 'image',
                enabled: true,
                title: titleInput ? titleInput.value : 'Image Display',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                alt_text: altTextInput ? altTextInput.value : 'Image',
                display_size: displaySizeSelect ? displaySizeSelect.value : 'medium',
                alignment: alignmentSelect ? alignmentSelect.value : 'center',
                require_response: requireResponseCheckbox ? requireResponseCheckbox.checked : false
            };
            
            // Handle file upload - get the uploaded file path
            const filePath = fileInput ? fileInput.getAttribute('data-file-path') : null;
            if (filePath) {
                imageConfig.file_path = filePath;
            } else if (fileInput && fileInput.files.length > 0) {
                imageConfig.file_name = fileInput.files[0].name;
            }
            
            // Handle response configuration
            if (imageConfig.require_response && responseTypeSelect) {
                imageConfig.response_type = responseTypeSelect.value;
                
                const responseDetails = sectionElement.querySelector('.response-details');
                if (responseDetails) {
                    if (imageConfig.response_type === 'rating') {
                        imageConfig.rating_question = getInputValue(responseDetails.querySelector('.js-rating-question')) || 'How would you rate this image?';
                        imageConfig.rating_scale = parseInt(getInputValue(responseDetails.querySelector('.js-rating-scale')) || '10') || 10;
                        imageConfig.rating_column_label = getInputValue(responseDetails.querySelector('.js-rating-column-label')) || '';
                    } else if (imageConfig.response_type === 'text') {
                        imageConfig.text_question = getInputValue(responseDetails.querySelector('.js-text-question')) || 'What are your thoughts about this image?';
                        imageConfig.text_rows = parseInt(getInputValue(responseDetails.querySelector('.js-text-rows')) || '4') || 4;
                        imageConfig.text_column_label = getInputValue(responseDetails.querySelector('.js-text-column-label')) || '';
                    } else if (imageConfig.response_type === 'checkbox') {
                        imageConfig.checkbox_question = getInputValue(responseDetails.querySelector('.js-checkbox-question')) || 'Select all that apply to this image:';
                        const checkboxOptionsText = getInputValue(responseDetails.querySelector('.js-checkbox-options')) || '';
                        imageConfig.checkbox_options = checkboxOptionsText.split('\n').filter(o => o.trim());
                        imageConfig.checkbox_column_label = getInputValue(responseDetails.querySelector('.js-checkbox-column-label')) || '';
                    }
                }
            }
            
            config.sections[sectionId] = imageConfig;
        } else if (sectionType === 'video') {
            const descriptionTextarea = sectionElement.querySelector('textarea');
            const fileInput = sectionElement.querySelector(`#video-upload-${sectionId}`);
            const urlInput = sectionElement.querySelector('.video-url-section input[type="url"]');
            const sourceTypeSelect = sectionElement.querySelector('.video-source-options select');
            const videoSizeSelect = sectionElement.querySelectorAll('select')[1]; // Second select is video size
            const autoplayCheckbox = sectionElement.querySelector(`#autoplay-${sectionId}`);
            const controlsCheckbox = sectionElement.querySelector(`#controls-${sectionId}`);
            const loopCheckbox = sectionElement.querySelector(`#loop-${sectionId}`);
            const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
            const responseTypeSelect = sectionElement.querySelector('.response-config select');
            
            let videoConfig = {
                type: 'video',
                enabled: true,
                title: titleInput ? titleInput.value : 'Video Display',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                video_size: videoSizeSelect ? videoSizeSelect.value : 'medium',
                autoplay: autoplayCheckbox ? autoplayCheckbox.checked : false,
                controls: controlsCheckbox ? controlsCheckbox.checked : true,
                loop: loopCheckbox ? loopCheckbox.checked : false,
                require_response: requireResponseCheckbox ? requireResponseCheckbox.checked : false
            };
            
            // Handle video source
            if (sourceTypeSelect && sourceTypeSelect.value === 'url' && urlInput) {
                videoConfig.video_url = urlInput.value;
            } else {
                // Handle file upload - get the uploaded file path
                const filePath = fileInput ? fileInput.getAttribute('data-file-path') : null;
                if (filePath) {
                    videoConfig.file_path = filePath;
                } else if (fileInput && fileInput.files.length > 0) {
                    videoConfig.file_name = fileInput.files[0].name;
                }
            }
            
            // Handle response configuration
            if (videoConfig.require_response && responseTypeSelect) {
                videoConfig.response_type = responseTypeSelect.value;
                
                const responseDetails = sectionElement.querySelector('.response-details');
                if (responseDetails) {
                    if (videoConfig.response_type === 'rating') {
                        videoConfig.rating_question = getInputValue(responseDetails.querySelector('.js-rating-question')) || 'How would you rate this video?';
                        videoConfig.rating_scale = parseInt(getInputValue(responseDetails.querySelector('.js-rating-scale')) || '10') || 10;
                        videoConfig.rating_column_label = getInputValue(responseDetails.querySelector('.js-rating-column-label')) || '';
                    } else if (videoConfig.response_type === 'text') {
                        videoConfig.text_question = getInputValue(responseDetails.querySelector('.js-text-question')) || 'What are your thoughts about this video?';
                        videoConfig.text_rows = parseInt(getInputValue(responseDetails.querySelector('.js-text-rows')) || '4') || 4;
                        videoConfig.text_column_label = getInputValue(responseDetails.querySelector('.js-text-column-label')) || '';
                    } else if (videoConfig.response_type === 'checkbox') {
                        videoConfig.checkbox_question = getInputValue(responseDetails.querySelector('.js-checkbox-question')) || 'Select all that apply to this video:';
                        const checkboxOptionsText = getInputValue(responseDetails.querySelector('.js-checkbox-options')) || '';
                        videoConfig.checkbox_options = checkboxOptionsText.split('\n').filter(o => o.trim());
                        videoConfig.checkbox_column_label = getInputValue(responseDetails.querySelector('.js-checkbox-column-label')) || '';
                    }
                }
            }
            
            config.sections[sectionId] = videoConfig;
        } else if (sectionType === 'pdf') {
            const descriptionTextarea = sectionElement.querySelector('textarea');
            const fileInput = sectionElement.querySelector(`#pdf-upload-${sectionId}`);
            const displayHeightSelect = sectionElement.querySelectorAll('select')[0];
            const displayModeSelect = sectionElement.querySelectorAll('select')[1];
            const allowDownloadCheckbox = sectionElement.querySelector(`#allow-download-${sectionId}`);
            const requireViewCheckbox = sectionElement.querySelector(`#require-view-${sectionId}`);
            const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
            const responseTypeSelect = sectionElement.querySelector('.response-config select');
            
            let pdfConfig = {
                type: 'pdf',
                enabled: true,
                title: titleInput ? titleInput.value : 'PDF Display',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                display_height: displayHeightSelect ? displayHeightSelect.value : '600',
                display_mode: displayModeSelect ? displayModeSelect.value : 'embed',
                allow_download: allowDownloadCheckbox ? allowDownloadCheckbox.checked : true,
                require_view: requireViewCheckbox ? requireViewCheckbox.checked : false,
                require_response: requireResponseCheckbox ? requireResponseCheckbox.checked : false
            };
            
            // Handle file upload - get the uploaded file path
            const filePath = fileInput ? fileInput.getAttribute('data-file-path') : null;
            if (filePath) {
                pdfConfig.file_path = filePath;
            } else if (fileInput && fileInput.files.length > 0) {
                pdfConfig.file_name = fileInput.files[0].name;
            }
            
            // Handle response configuration
            if (pdfConfig.require_response && responseTypeSelect) {
                pdfConfig.response_type = responseTypeSelect.value;
                
                const responseDetails = sectionElement.querySelector('.response-details');
                if (responseDetails) {
                    if (pdfConfig.response_type === 'confirmation') {
                        pdfConfig.confirmation_text = getInputValue(responseDetails.querySelector('.js-confirmation-text')) || 'I have read and understood the document';
                        pdfConfig.confirmation_column_label = getInputValue(responseDetails.querySelector('.js-confirmation-column-label')) || '';
                    } else if (pdfConfig.response_type === 'rating') {
                        pdfConfig.rating_question = getInputValue(responseDetails.querySelector('.js-rating-question')) || 'How would you rate this document?';
                        pdfConfig.rating_scale = parseInt(getInputValue(responseDetails.querySelector('.js-rating-scale')) || '10') || 10;
                        pdfConfig.rating_column_label = getInputValue(responseDetails.querySelector('.js-rating-column-label')) || '';
                    } else if (pdfConfig.response_type === 'text') {
                        pdfConfig.text_question = getInputValue(responseDetails.querySelector('.js-text-question')) || 'What are your thoughts about this document?';
                        pdfConfig.text_rows = parseInt(getInputValue(responseDetails.querySelector('.js-text-rows')) || '4') || 4;
                        pdfConfig.text_column_label = getInputValue(responseDetails.querySelector('.js-text-column-label')) || '';
                    } else if (pdfConfig.response_type === 'checkbox') {
                        pdfConfig.checkbox_question = getInputValue(responseDetails.querySelector('.js-checkbox-question')) || 'Select all that apply to this document:';
                        const checkboxOptionsText = getInputValue(responseDetails.querySelector('.js-checkbox-options')) || '';
                        pdfConfig.checkbox_options = checkboxOptionsText.split('\n').filter(o => o.trim());
                        pdfConfig.checkbox_column_label = getInputValue(responseDetails.querySelector('.js-checkbox-column-label')) || '';
                    }
                }
            }
            
            config.sections[sectionId] = pdfConfig;
        }
    });
    
    return config;
}

function previewSurvey() {
    const config = collectSurveyConfiguration();
    
    fetch('/preview-survey', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
    })
    .then(response => response.text())
    .then(html => {
        const preview = document.getElementById('survey-preview');
        const iframe = document.getElementById('survey-preview-iframe');
        iframe.srcdoc = html;
        preview.style.display = 'block';
        preview.scrollIntoView({ behavior: 'smooth' });
    })
    .catch(error => {
        showFeedback('survey-feedback', 'Error generating preview', 'error');
    });
}

function loadSurveyConfiguration(showFeedbackMessage = false) {
    fetch('/get-survey-config')
    .then(response => response.json())
    .then(config => {
        if (config) {
            populateSurveyForm(config);
            checkUploadedFiles(); // This checks for existing uploaded files
            if (showFeedbackMessage) {
                showFeedback('survey-feedback', 'Configuration loaded successfully!', 'success');
            }
        }
    })
    .catch(error => {
        if (showFeedbackMessage) {
            showFeedback('survey-feedback', 'Error loading configuration', 'error');
        }
    });
}

function checkUploadedFiles() {
    // Check for info file
    fetch('/download-form-file/information', { method: 'HEAD' })
    .then(response => {
        if (response.ok) {
            document.getElementById('information-file-status').innerHTML = 
                '<span class="file-status success">✓ Information sheet uploaded</span>';
        }
    })
    .catch(() => {
    });
    
    // Check for consent file
    fetch('/download-form-file/consent', { method: 'HEAD' })
    .then(response => {
        if (response.ok) {
            document.getElementById('consent-file-status').innerHTML = 
                '<span class="file-status success">✓ Consent form uploaded</span>';
        }
    })
    .catch(() => {
    });
}

function populateSurveyForm(config) {
    // Populate basic form fields
    document.getElementById('survey-title').value = config.title || 'Survey Form';
    document.getElementById('information-title').value = config.information?.title || 'Information and Consent Form';
    document.getElementById('information-content').value = config.information?.content || '';
    document.getElementById('consent-content').value = config.consent?.content || '';
    
    // Populate settings
    document.getElementById('show-progress').checked = config.settings?.showProgress !== false;
    document.getElementById('randomize-sections').checked = config.settings?.randomizeSections === true;
    document.getElementById('randomize-items').checked = config.settings?.randomizeItems === true;
    document.getElementById('completion-message').value = config.settings?.completionMessage || 'Survey completed! Redirecting to chat...';
    
    // Clear existing dynamic sections
    const dynamicContainer = document.getElementById('dynamic-sections-container');
    dynamicContainer.innerHTML = '';
    
    // Populate dynamic sections
    if (config.sections) {
        Object.keys(config.sections).forEach(sectionId => {
            const sectionConfig = config.sections[sectionId];
            if (!sectionConfig.enabled) return;
            
            // Create the section based on its type
            let sectionHTML = '';
            
            switch (sectionConfig.type) {
                case 'demographics':
                    sectionHTML = createDemographicsSection(sectionId);
                    break;
                case 'likert':
                    sectionHTML = createLikertSection(sectionId);
                    break;
                case 'freetext':
                    sectionHTML = createFreetextSection(sectionId);
                    break;
                case 'checkbox':
                    sectionHTML = createCheckboxSection(sectionId);
                    break;
                case 'dropdown':
                    sectionHTML = createDropdownSection(sectionId);
                    break;
                case 'slider':
                    sectionHTML = createSliderSection(sectionId);
                    break;
                case 'custom':
                    sectionHTML = createCustomSection(sectionId);
                    break;
                case 'image':
                    sectionHTML = createImageSection(sectionId);
                    break;
                case 'video':
                    sectionHTML = createVideoSection(sectionId);
                    break;
                case 'pdf':
                    sectionHTML = createPDFSection(sectionId);
                    break;
            }
            
            if (sectionHTML) {
                const newSection = document.createElement('div');
                newSection.className = 'survey-section-config';
                newSection.setAttribute('data-section', sectionId);
                newSection.innerHTML = sectionHTML;
                dynamicContainer.appendChild(newSection);
                
                // Populate section-specific data
                setTimeout(() => {
                    populateSectionData(sectionId, sectionConfig);
                }, 100);
            }
        });
    }
    
}

function populateSectionData(sectionId, sectionConfig) {
    const sectionElement = document.querySelector(`[data-section="${sectionId}"]`);
    if (!sectionElement) return;
    
    // Set title
    const titleInput = sectionElement.querySelector('input[type="text"]');
    if (titleInput && sectionConfig.title) {
        titleInput.value = sectionConfig.title;
    }
    
    if (sectionConfig.type === 'demographics') {
        // Populate demographics fields
        if (sectionConfig.fields?.age) {
            const ageCheckbox = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="checkbox"]');
            const ageMinInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:first-of-type');
            const ageMaxInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:last-of-type');
            
            if (ageCheckbox) ageCheckbox.checked = sectionConfig.fields.age.enabled;
            if (ageMinInput) ageMinInput.value = sectionConfig.fields.age.min || '18';
            if (ageMaxInput) ageMaxInput.value = sectionConfig.fields.age.max || '99';

            const ageColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="age"]');
            if (ageColumnLabelInput) ageColumnLabelInput.value = sectionConfig.fields.age.column_label || '';
        }
        
        if (sectionConfig.fields?.gender) {
            const genderCheckbox = sectionElement.querySelector('.demographics-fields .field-config:nth-child(2) input[type="checkbox"]');
            const genderOptionsInput = sectionElement.querySelector('.gender-options input[type="text"]');
            
            if (genderCheckbox) genderCheckbox.checked = sectionConfig.fields.gender.enabled;
            if (genderOptionsInput && sectionConfig.fields.gender.options) {
                genderOptionsInput.value = sectionConfig.fields.gender.options.join(', ');
            }

            const genderColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="gender"]');
            if (genderColumnLabelInput) genderColumnLabelInput.value = sectionConfig.fields.gender.column_label || '';
        }
    } else if (sectionConfig.type === 'likert') {
        // Populate likert scale configuration
        const scaleTypeSelect = sectionElement.querySelector('.likert-scale-type');
        const scaleLabelsInput = sectionElement.querySelector('.scale-labels');
        
        if (scaleTypeSelect && sectionConfig.scaleType) {
            scaleTypeSelect.value = sectionConfig.scaleType;
        }
        if (scaleLabelsInput && sectionConfig.scaleLabels) {
            scaleLabelsInput.value = sectionConfig.scaleLabels;
        }
        
        // Clear existing items and add configured ones
        const itemsContainer = sectionElement.querySelector('.likert-items');
        if (itemsContainer && sectionConfig.items) {
            itemsContainer.innerHTML = '';
            sectionConfig.items.forEach(item => {
                const itemObj = (typeof item === 'string') ? { statement: item } : (item || {});
                const statement = (itemObj.statement || itemObj.text || itemObj.item || '').toString();
                const columnLabel = (itemObj.column_label || '').toString();
                const itemId = (itemObj.id || generateInternalId('likert')).toString();

                const newItem = document.createElement('div');
                newItem.className = 'likert-item';
                newItem.setAttribute('data-item-id', itemId);
                newItem.innerHTML = `
                    <input type="text" class="likert-statement-input" value="${statement}" placeholder="Enter statement">
                    <input type="text" class="column-label-input" value="${columnLabel}" placeholder="Column label (hidden from participant)" style="width: 260px;">
                    <button type="button" class="btn-remove" onclick="removeLikertItem(this)">×</button>
                `;
                itemsContainer.appendChild(newItem);
            });
        }
        
        // Update scale labels visibility
        updateLikertLabelsForSection(sectionId);
    } else if (sectionConfig.type === 'freetext') {
        // Populate freetext questions
        const questionsContainer = sectionElement.querySelector('.freetext-questions');
        if (questionsContainer && sectionConfig.questions) {
            questionsContainer.innerHTML = '';
            sectionConfig.questions.forEach(questionConfig => {
                const questionId = questionConfig.id || generateInternalId('freetext');
                const columnLabel = questionConfig.column_label || '';

                const newQuestion = document.createElement('div');
                newQuestion.className = 'freetext-question';
                newQuestion.setAttribute('data-question-id', questionId);
                newQuestion.innerHTML = `
                    <label>Question:</label>
                    <input type="text" class="freetext-question-input" value="${questionConfig.question || ''}" placeholder="Enter question">
                    <label>Column label (hidden from participant):</label>
                    <input type="text" class="column-label-input" value="${columnLabel}" placeholder="e.g., my_column_label">
                    <label>Text area rows:</label>
                    <input type="number" class="freetext-rows-input" value="${questionConfig.rows || 4}" min="1" max="20" style="width: 60px;">
                    <button type="button" class="btn-remove" onclick="removeFreetextQuestion(this)">×</button>
                `;
                questionsContainer.appendChild(newQuestion);
            });
        }
    } else if (sectionConfig.type === 'custom') {
        // Populate custom section
        const descriptionTextarea = sectionElement.querySelector('textarea');
        if (descriptionTextarea && sectionConfig.description) {
            descriptionTextarea.value = sectionConfig.description;
        }
        
        // Populate custom fields
        const fieldsContainer = sectionElement.querySelector('.custom-fields');
        if (fieldsContainer && sectionConfig.fields) {
            fieldsContainer.innerHTML = '';
            sectionConfig.fields.forEach(fieldConfig => {
                const fieldDiv = document.createElement('div');
                fieldDiv.className = 'field-config';
                fieldDiv.innerHTML = `
                    <input type="text" class="js-custom-label" value="${fieldConfig.label}" placeholder="Field label" style="width: 200px;">
                    <select style="width: 120px;">
                        <option value="text" ${fieldConfig.type === 'text' ? 'selected' : ''}>Text Input</option>
                        <option value="textarea" ${fieldConfig.type === 'textarea' ? 'selected' : ''}>Text Area</option>
                        <option value="number" ${fieldConfig.type === 'number' ? 'selected' : ''}>Number</option>
                        <option value="email" ${fieldConfig.type === 'email' ? 'selected' : ''}>Email</option>
                        <option value="select" ${fieldConfig.type === 'select' ? 'selected' : ''}>Dropdown</option>
                        <option value="radio" ${fieldConfig.type === 'radio' ? 'selected' : ''}>Radio Buttons</option>
                        <option value="checkbox" ${fieldConfig.type === 'checkbox' ? 'selected' : ''}>Checkboxes</option>
                        <option value="likert" ${fieldConfig.type === 'likert' ? 'selected' : ''}>Likert Scale</option>
                    </select>
                    <input type="text" class="js-custom-options" value="${fieldConfig.options || ''}" placeholder="Options/validation" style="flex: 1;">
                    <input type="text" class="js-custom-column-label column-label-input" value="${fieldConfig.column_label || ''}" placeholder="Column label (hidden from participant)" style="width: 220px;">
                    <input type="checkbox" ${fieldConfig.required ? 'checked' : ''}> <label style="margin: 0;">Required</label>
                    <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
                `;
                fieldsContainer.appendChild(fieldDiv);
            });
        }
    } else if (sectionConfig.type === 'checkbox') {
        // Populate checkbox section
        const questionInput = sectionElement.querySelectorAll('input[type="text"]')[1];
        if (questionInput && sectionConfig.question) {
            questionInput.value = sectionConfig.question;
        }

        const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
        if (columnLabelInput) {
            columnLabelInput.value = sectionConfig.column_label || '';
        }
        
        // Populate checkbox options
        const optionsContainer = sectionElement.querySelector('.checkbox-options');
        if (optionsContainer && sectionConfig.options) {
            optionsContainer.innerHTML = '';
            sectionConfig.options.forEach((option, index) => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'option-item';
                optionDiv.innerHTML = `
                    <input type="text" value="${option}" placeholder="Option ${index + 1}">
                    <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
                `;
                optionsContainer.appendChild(optionDiv);
            });
        }
    } else if (sectionConfig.type === 'dropdown') {
        // Populate dropdown section
        const questionInput = sectionElement.querySelectorAll('input[type="text"]')[1];
        if (questionInput && sectionConfig.question) {
            questionInput.value = sectionConfig.question;
        }

        const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
        if (columnLabelInput) {
            columnLabelInput.value = sectionConfig.column_label || '';
        }
        
        const requiredCheckbox = sectionElement.querySelector('.section-content > input[type="checkbox"]');
        if (requiredCheckbox) {
            requiredCheckbox.checked = sectionConfig.required || false;
        }
        
        // Populate dropdown options
        const optionsContainer = sectionElement.querySelector('.dropdown-options');
        if (optionsContainer && sectionConfig.options) {
            optionsContainer.innerHTML = '';
            sectionConfig.options.forEach((option, index) => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'option-item';
                optionDiv.innerHTML = `
                    <input type="text" value="${option}" placeholder="Option ${index + 1}">
                    <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
                `;
                optionsContainer.appendChild(optionDiv);
            });
        }
    } else if (sectionConfig.type === 'slider') {
        // Populate slider section
        const questionInput = sectionElement.querySelectorAll('input[type="text"]')[1];
        if (questionInput && sectionConfig.question) {
            questionInput.value = sectionConfig.question;
        }

        const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
        if (columnLabelInput) {
            columnLabelInput.value = sectionConfig.column_label || '';
        }
        
        const requiredCheckbox = sectionElement.querySelector('.section-content > input[type="checkbox"]');
        if (requiredCheckbox) {
            requiredCheckbox.checked = sectionConfig.required || false;
        }
        
        // Set slider type
        const sliderTypeRadio = sectionElement.querySelector(`input[name="slider-type-${sectionId}"][value="${sectionConfig.slider_type || 'labels'}"]`);
        if (sliderTypeRadio) {
            sliderTypeRadio.checked = true;
            updateSliderConfig(sectionId);
        }
        
        // Populate slider configuration
        if (sectionConfig.slider_type === 'numeric') {
            const numericInputs = sectionElement.querySelectorAll('.numeric-config input[type="number"]');
            if (numericInputs[0]) numericInputs[0].value = sectionConfig.min_value || 0;
            if (numericInputs[1]) numericInputs[1].value = sectionConfig.max_value || 100;
            if (numericInputs[2]) numericInputs[2].value = sectionConfig.default_value || 50;
        } else {
            const labelInputs = sectionElement.querySelectorAll('.label-config input[type="text"]');
            if (labelInputs[0]) labelInputs[0].value = sectionConfig.left_label || 'Strongly Disagree';
            if (labelInputs[1]) labelInputs[1].value = sectionConfig.right_label || 'Strongly Agree';
            
            const stepInput = sectionElement.querySelector('.label-config input[type="number"]:nth-of-type(1)');
            const defaultInput = sectionElement.querySelector('.label-config input[type="number"]:nth-of-type(2)');
            if (stepInput) stepInput.value = sectionConfig.steps || 7;
            if (defaultInput) defaultInput.value = sectionConfig.default_value || 4;
        }
    } else if (sectionConfig.type === 'image') {
        const descriptionTextarea = sectionElement.querySelector('textarea');
        if (descriptionTextarea) descriptionTextarea.value = sectionConfig.description || '';

        const altTextInput = sectionElement.querySelector('.image-alt-text input[type="text"]');
        if (altTextInput) altTextInput.value = sectionConfig.alt_text || '';

        const selects = sectionElement.querySelectorAll('select');
        const displaySizeSelect = selects[0];
        const alignmentSelect = selects[1];
        if (displaySizeSelect) displaySizeSelect.value = sectionConfig.display_size || 'medium';
        if (alignmentSelect) alignmentSelect.value = sectionConfig.alignment || 'center';

        const fileInput = sectionElement.querySelector(`#image-upload-${sectionId}`);
        if (fileInput && sectionConfig.file_path) {
            fileInput.setAttribute('data-file-path', sectionConfig.file_path);
        }

        const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
        if (requireResponseCheckbox) {
            requireResponseCheckbox.checked = sectionConfig.require_response === true;
            const responseConfig = sectionElement.querySelector('.response-config');
            if (responseConfig) responseConfig.style.display = requireResponseCheckbox.checked ? 'block' : 'none';
        }

        if (sectionConfig.require_response) {
            const responseTypeSelect = sectionElement.querySelector('.response-config select');
            if (responseTypeSelect) {
                responseTypeSelect.value = sectionConfig.response_type || 'rating';
                toggleImageResponseType(sectionId, responseTypeSelect.value);
            }

            const responseDetails = sectionElement.querySelector('.response-details');
            if (responseDetails) {
                if (sectionConfig.response_type === 'rating') {
                    const q = responseDetails.querySelector('.js-rating-question');
                    const s = responseDetails.querySelector('.js-rating-scale');
                    const cl = responseDetails.querySelector('.js-rating-column-label');
                    if (q) q.value = sectionConfig.rating_question || '';
                    if (s) s.value = sectionConfig.rating_scale || 10;
                    if (cl) cl.value = sectionConfig.rating_column_label || '';
                } else if (sectionConfig.response_type === 'text') {
                    const q = responseDetails.querySelector('.js-text-question');
                    const r = responseDetails.querySelector('.js-text-rows');
                    const cl = responseDetails.querySelector('.js-text-column-label');
                    if (q) q.value = sectionConfig.text_question || '';
                    if (r) r.value = sectionConfig.text_rows || 4;
                    if (cl) cl.value = sectionConfig.text_column_label || '';
                } else if (sectionConfig.response_type === 'checkbox') {
                    const q = responseDetails.querySelector('.js-checkbox-question');
                    const o = responseDetails.querySelector('.js-checkbox-options');
                    const cl = responseDetails.querySelector('.js-checkbox-column-label');
                    if (q) q.value = sectionConfig.checkbox_question || '';
                    if (o) o.value = (sectionConfig.checkbox_options || []).join('\n');
                    if (cl) cl.value = sectionConfig.checkbox_column_label || '';
                }
            }
        }
    } else if (sectionConfig.type === 'video') {
        const descriptionTextarea = sectionElement.querySelector('textarea');
        if (descriptionTextarea) descriptionTextarea.value = sectionConfig.description || '';

        const fileInput = sectionElement.querySelector(`#video-upload-${sectionId}`);
        if (fileInput && sectionConfig.file_path) {
            fileInput.setAttribute('data-file-path', sectionConfig.file_path);
        }

        const selects = sectionElement.querySelectorAll('select');
        const sourceTypeSelect = sectionElement.querySelector('.video-source-options select');
        if (sourceTypeSelect) {
            sourceTypeSelect.value = sectionConfig.video_url ? 'url' : 'upload';
            toggleVideoSourceType(sectionId, sourceTypeSelect.value);
        }

        const urlInput = sectionElement.querySelector('.video-url-section input[type="url"]');
        if (urlInput) urlInput.value = sectionConfig.video_url || '';

        const videoSizeSelect = selects[1];
        if (videoSizeSelect) videoSizeSelect.value = sectionConfig.video_size || 'medium';

        const autoplayCheckbox = sectionElement.querySelector(`#autoplay-${sectionId}`);
        const controlsCheckbox = sectionElement.querySelector(`#controls-${sectionId}`);
        const loopCheckbox = sectionElement.querySelector(`#loop-${sectionId}`);
        if (autoplayCheckbox) autoplayCheckbox.checked = sectionConfig.autoplay === true;
        if (controlsCheckbox) controlsCheckbox.checked = sectionConfig.controls !== false;
        if (loopCheckbox) loopCheckbox.checked = sectionConfig.loop === true;

        const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
        if (requireResponseCheckbox) {
            requireResponseCheckbox.checked = sectionConfig.require_response === true;
            const responseConfig = sectionElement.querySelector('.response-config');
            if (responseConfig) responseConfig.style.display = requireResponseCheckbox.checked ? 'block' : 'none';
        }

        if (sectionConfig.require_response) {
            const responseTypeSelect = sectionElement.querySelector('.response-config select');
            if (responseTypeSelect) {
                responseTypeSelect.value = sectionConfig.response_type || 'rating';
                toggleVideoResponseType(sectionId, responseTypeSelect.value);
            }

            const responseDetails = sectionElement.querySelector('.response-details');
            if (responseDetails) {
                if (sectionConfig.response_type === 'rating') {
                    const q = responseDetails.querySelector('.js-rating-question');
                    const s = responseDetails.querySelector('.js-rating-scale');
                    const cl = responseDetails.querySelector('.js-rating-column-label');
                    if (q) q.value = sectionConfig.rating_question || '';
                    if (s) s.value = sectionConfig.rating_scale || 10;
                    if (cl) cl.value = sectionConfig.rating_column_label || '';
                } else if (sectionConfig.response_type === 'text') {
                    const q = responseDetails.querySelector('.js-text-question');
                    const r = responseDetails.querySelector('.js-text-rows');
                    const cl = responseDetails.querySelector('.js-text-column-label');
                    if (q) q.value = sectionConfig.text_question || '';
                    if (r) r.value = sectionConfig.text_rows || 4;
                    if (cl) cl.value = sectionConfig.text_column_label || '';
                } else if (sectionConfig.response_type === 'checkbox') {
                    const q = responseDetails.querySelector('.js-checkbox-question');
                    const o = responseDetails.querySelector('.js-checkbox-options');
                    const cl = responseDetails.querySelector('.js-checkbox-column-label');
                    if (q) q.value = sectionConfig.checkbox_question || '';
                    if (o) o.value = (sectionConfig.checkbox_options || []).join('\n');
                    if (cl) cl.value = sectionConfig.checkbox_column_label || '';
                }
            }
        }
    } else if (sectionConfig.type === 'pdf') {
        const descriptionTextarea = sectionElement.querySelector('textarea');
        if (descriptionTextarea) descriptionTextarea.value = sectionConfig.description || '';

        const selects = sectionElement.querySelectorAll('select');
        const displayHeightSelect = selects[0];
        const displayModeSelect = selects[1];
        if (displayHeightSelect) displayHeightSelect.value = sectionConfig.display_height || '600';
        if (displayModeSelect) displayModeSelect.value = sectionConfig.display_mode || 'embed';

        const allowDownloadCheckbox = sectionElement.querySelector(`#allow-download-${sectionId}`);
        const requireViewCheckbox = sectionElement.querySelector(`#require-view-${sectionId}`);
        if (allowDownloadCheckbox) allowDownloadCheckbox.checked = sectionConfig.allow_download !== false;
        if (requireViewCheckbox) requireViewCheckbox.checked = sectionConfig.require_view === true;

        const fileInput = sectionElement.querySelector(`#pdf-upload-${sectionId}`);
        if (fileInput && sectionConfig.file_path) {
            fileInput.setAttribute('data-file-path', sectionConfig.file_path);
        }

        const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
        if (requireResponseCheckbox) {
            requireResponseCheckbox.checked = sectionConfig.require_response === true;
            const responseConfig = sectionElement.querySelector('.response-config');
            if (responseConfig) responseConfig.style.display = requireResponseCheckbox.checked ? 'block' : 'none';
        }

        if (sectionConfig.require_response) {
            const responseTypeSelect = sectionElement.querySelector('.response-config select');
            if (responseTypeSelect) {
                responseTypeSelect.value = sectionConfig.response_type || 'confirmation';
                togglePDFResponseType(sectionId, responseTypeSelect.value);
            }

            const responseDetails = sectionElement.querySelector('.response-details');
            if (responseDetails) {
                if (sectionConfig.response_type === 'confirmation') {
                    const t = responseDetails.querySelector('.js-confirmation-text');
                    const cl = responseDetails.querySelector('.js-confirmation-column-label');
                    if (t) t.value = sectionConfig.confirmation_text || '';
                    if (cl) cl.value = sectionConfig.confirmation_column_label || '';
                } else if (sectionConfig.response_type === 'rating') {
                    const q = responseDetails.querySelector('.js-rating-question');
                    const s = responseDetails.querySelector('.js-rating-scale');
                    const cl = responseDetails.querySelector('.js-rating-column-label');
                    if (q) q.value = sectionConfig.rating_question || '';
                    if (s) s.value = sectionConfig.rating_scale || 10;
                    if (cl) cl.value = sectionConfig.rating_column_label || '';
                } else if (sectionConfig.response_type === 'text') {
                    const q = responseDetails.querySelector('.js-text-question');
                    const r = responseDetails.querySelector('.js-text-rows');
                    const cl = responseDetails.querySelector('.js-text-column-label');
                    if (q) q.value = sectionConfig.text_question || '';
                    if (r) r.value = sectionConfig.text_rows || 4;
                    if (cl) cl.value = sectionConfig.text_column_label || '';
                } else if (sectionConfig.response_type === 'checkbox') {
                    const q = responseDetails.querySelector('.js-checkbox-question');
                    const o = responseDetails.querySelector('.js-checkbox-options');
                    const cl = responseDetails.querySelector('.js-checkbox-column-label');
                    if (q) q.value = sectionConfig.checkbox_question || '';
                    if (o) o.value = (sectionConfig.checkbox_options || []).join('\n');
                    if (cl) cl.value = sectionConfig.checkbox_column_label || '';
                }
            }
        }
    }
}

function resetSurveyToDefault() {
    if (confirm('Are you sure you want to reset the survey to default settings? This will delete any custom configuration and uploaded files.')) {
        fetch('/reset-survey-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showFeedback('survey-feedback', 'Survey configuration reset successfully!', 'success');
                // Reload the page to reset form fields
                setTimeout(() => {
                    location.reload();
                }, 1000);
            } else {
                showFeedback('survey-feedback', 'Error resetting configuration: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showFeedback('survey-feedback', 'Error resetting configuration', 'error');
        });
    }
}

function showFeedback(elementId, message, type) {
    const feedbackElement = document.getElementById(elementId);
    if (feedbackElement) {
        feedbackElement.innerHTML = `<div class="feedback-${type}">${message}</div>`;
        feedbackElement.style.display = 'block';
        
        // Clear after 5 seconds for success/info messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                feedbackElement.innerHTML = '';
                feedbackElement.style.display = 'none';
            }, 5000);
        }
    }
}

// Uploaded median section handlers

function handleImageUpload(sectionId) {
    const fileInput = document.getElementById(`image-upload-${sectionId}`);
    const statusDiv = document.getElementById(`image-file-status-${sectionId}`);
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = file.name;
        const fileSize = (file.size / 1024 / 1024).toFixed(2);
        
        // Validate file type using both MIME type and file extension
        const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const validImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        
        const isValidMimeType = file.type && validImageTypes.includes(file.type.toLowerCase());
        const isValidExtension = validImageExtensions.includes(fileExtension);
        
        if (isValidMimeType || isValidExtension) {
            statusDiv.innerHTML = `<span class="file-uploading">⏳ Uploading ${fileName} (${fileSize} MB)...</span>`;
            statusDiv.className = 'file-status uploading';
            
            // Create FormData and upload file
            const formData = new FormData();
            formData.append('file', file);
            formData.append('media_type', 'image');
            formData.append('section_id', sectionId);
            
            fetch('/upload-survey-media', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    statusDiv.innerHTML = `<span class="file-success">✓ ${fileName} uploaded successfully</span>`;
                    statusDiv.className = 'file-status success';
                    // Store the file path for later use in survey configuration
                    fileInput.setAttribute('data-file-path', data.file_path);
                } else {
                    statusDiv.innerHTML = `<span class="file-error">✗ Upload failed: ${data.error}</span>`;
                    statusDiv.className = 'file-status error';
                    fileInput.value = '';
                }
            })
            .catch(error => {
                console.error('Upload error:', error);
                statusDiv.innerHTML = `<span class="file-error">✗ Upload failed - please try again</span>`;
                statusDiv.className = 'file-status error';
                fileInput.value = '';
            });
        } else {
            statusDiv.innerHTML = `<span class="file-error">✗ Invalid file type. Please select an image file (.jpg, .jpeg, .png, .gif, .webp).</span>`;
            statusDiv.className = 'file-status error';
            fileInput.value = '';
        }
    } else {
        statusDiv.innerHTML = '';
        statusDiv.className = 'file-status';
    }
}

function handleVideoUpload(sectionId) {
    const fileInput = document.getElementById(`video-upload-${sectionId}`);
    const statusDiv = document.getElementById(`video-file-status-${sectionId}`);
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = file.name;
        const fileSize = (file.size / 1024 / 1024).toFixed(2);
        
        // Validate file type using both MIME type and file extension
        const validVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov', 'video/quicktime'];
        const validVideoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov'];
        const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        
        const isValidMimeType = file.type && validVideoTypes.includes(file.type.toLowerCase());
        const isValidExtension = validVideoExtensions.includes(fileExtension);
        
        if (isValidMimeType || isValidExtension) {
            statusDiv.innerHTML = `<span class="file-uploading">⏳ Uploading ${fileName} (${fileSize} MB)...</span>`;
            statusDiv.className = 'file-status uploading';
            
            // Create FormData and upload file
            const formData = new FormData();
            formData.append('file', file);
            formData.append('media_type', 'video');
            formData.append('section_id', sectionId);
            
            fetch('/upload-survey-media', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    statusDiv.innerHTML = `<span class="file-success">✓ ${fileName} uploaded successfully</span>`;
                    statusDiv.className = 'file-status success';
                    // Store the file path for later use in survey configuration
                    fileInput.setAttribute('data-file-path', data.file_path);
                } else {
                    statusDiv.innerHTML = `<span class="file-error">✗ Upload failed: ${data.error}</span>`;
                    statusDiv.className = 'file-status error';
                    fileInput.value = '';
                }
            })
            .catch(error => {
                console.error('Upload error:', error);
                statusDiv.innerHTML = `<span class="file-error">✗ Upload failed - please try again</span>`;
                statusDiv.className = 'file-status error';
                fileInput.value = '';
            });
        } else {
            statusDiv.innerHTML = `<span class="file-error">✗ Invalid file type. Please select a video file (.mp4, .webm, .ogg, .avi, .mov).</span>`;
            statusDiv.className = 'file-status error';
            fileInput.value = '';
        }
    } else {
        statusDiv.innerHTML = '';
        statusDiv.className = 'file-status';
    }
}

function handlePDFUpload(sectionId) {
    const fileInput = document.getElementById(`pdf-upload-${sectionId}`);
    const statusDiv = document.getElementById(`pdf-file-status-${sectionId}`);
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = file.name;
        const fileSize = (file.size / 1024 / 1024).toFixed(2);
        
        if (file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
            statusDiv.innerHTML = `<span class="file-uploading">⏳ Uploading ${fileName} (${fileSize} MB)...</span>`;
            statusDiv.className = 'file-status uploading';
            
            // Create FormData and upload file
            const formData = new FormData();
            formData.append('file', file);
            formData.append('media_type', 'pdf');
            formData.append('section_id', sectionId);
            
            fetch('/upload-survey-media', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    statusDiv.innerHTML = `<span class="file-success">✓ ${fileName} uploaded successfully</span>`;
                    statusDiv.className = 'file-status success';
                    // Store the file path for later use in survey configuration
                    fileInput.setAttribute('data-file-path', data.file_path);
                } else {
                    statusDiv.innerHTML = `<span class="file-error">✗ Upload failed: ${data.error}</span>`;
                    statusDiv.className = 'file-status error';
                    fileInput.value = '';
                }
            })
            .catch(error => {
                statusDiv.innerHTML = `<span class="file-error">✗ Upload failed - please try again</span>`;
                statusDiv.className = 'file-status error';
                fileInput.value = '';
            });
        } else {
            statusDiv.innerHTML = `<span class="file-error">✗ Invalid file type. Please select a PDF file.</span>`;
            statusDiv.className = 'file-status error';
            fileInput.value = '';
        }
    } else {
        statusDiv.innerHTML = '';
        statusDiv.className = 'file-status';
    }
}

function toggleVideoSourceType(sectionId, sourceType) {
    const uploadSection = document.getElementById(`video-upload-section-${sectionId}`);
    const urlSection = document.getElementById(`video-url-section-${sectionId}`);
    
    if (sourceType === 'upload') {
        uploadSection.style.display = 'block';
        urlSection.style.display = 'none';
    } else {
        uploadSection.style.display = 'none';
        urlSection.style.display = 'block';
    }
}

function toggleImageResponseType(sectionId, responseType) {
    const responseDetails = document.getElementById(`image-response-details-${sectionId}`);
    
    let html = '';
    switch (responseType) {
        case 'rating':
            html = `
                <label>Rating Question:</label>
                <input type="text" class="js-rating-question" value="How would you rate this image?" placeholder="Rating question">
                <label>Scale (1-10):</label>
                <input type="number" class="js-rating-scale" value="10" min="2" max="20">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-rating-column-label column-label-input" placeholder="e.g., image_${sectionId}_rating">
            `;
            break;
        case 'text':
            html = `
                <label>Question:</label>
                <input type="text" class="js-text-question" value="What are your thoughts about this image?" placeholder="Text response question">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-text-column-label column-label-input" placeholder="e.g., image_${sectionId}_text">
                <label>Text area rows:</label>
                <input type="number" class="js-text-rows" value="4" min="1" max="20">
            `;
            break;
        case 'checkbox':
            html = `
                <label>Question:</label>
                <input type="text" class="js-checkbox-question" value="Select all that apply to this image:" placeholder="Checkbox question">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-checkbox-column-label column-label-input" placeholder="e.g., image_${sectionId}_checkbox">
                <label>Options (one per line):</label>
                <textarea rows="4" class="js-checkbox-options" placeholder="Option 1\nOption 2\nOption 3"></textarea>
            `;
            break;
    }
    responseDetails.innerHTML = html;
}

function toggleVideoResponseType(sectionId, responseType) {
    const responseDetails = document.getElementById(`video-response-details-${sectionId}`);
    
    let html = '';
    switch (responseType) {
        case 'rating':
            html = `
                <label>Rating Question:</label>
                <input type="text" class="js-rating-question" value="How would you rate this video?" placeholder="Rating question">
                <label>Scale (1-10):</label>
                <input type="number" class="js-rating-scale" value="10" min="2" max="20">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-rating-column-label column-label-input" placeholder="e.g., video_${sectionId}_rating">
            `;
            break;
        case 'text':
            html = `
                <label>Question:</label>
                <input type="text" class="js-text-question" value="What are your thoughts about this video?" placeholder="Text response question">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-text-column-label column-label-input" placeholder="e.g., video_${sectionId}_text">
                <label>Text area rows:</label>
                <input type="number" class="js-text-rows" value="4" min="1" max="20">
            `;
            break;
        case 'checkbox':
            html = `
                <label>Question:</label>
                <input type="text" class="js-checkbox-question" value="Select all that apply to this video:" placeholder="Checkbox question">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-checkbox-column-label column-label-input" placeholder="e.g., video_${sectionId}_checkbox">
                <label>Options (one per line):</label>
                <textarea rows="4" class="js-checkbox-options" placeholder="Option 1\nOption 2\nOption 3"></textarea>
            `;
            break;
    }
    responseDetails.innerHTML = html;
}

function togglePDFResponseType(sectionId, responseType) {
    const responseDetails = document.getElementById(`pdf-response-details-${sectionId}`);
    
    let html = '';
    switch (responseType) {
        case 'confirmation':
            html = `
                <label>Confirmation Text:</label>
                <input type="text" class="js-confirmation-text" value="I have read and understood the document" placeholder="Confirmation text">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-confirmation-column-label column-label-input" placeholder="e.g., pdf_${sectionId}_confirmed">
            `;
            break;
        case 'rating':
            html = `
                <label>Rating Question:</label>
                <input type="text" class="js-rating-question" value="How would you rate this document?" placeholder="Rating question">
                <label>Scale (1-10):</label>
                <input type="number" class="js-rating-scale" value="10" min="2" max="20">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-rating-column-label column-label-input" placeholder="e.g., pdf_${sectionId}_rating">
            `;
            break;
        case 'text':
            html = `
                <label>Question:</label>
                <input type="text" class="js-text-question" value="What are your thoughts about this document?" placeholder="Text response question">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-text-column-label column-label-input" placeholder="e.g., pdf_${sectionId}_text">
                <label>Text area rows:</label>
                <input type="number" class="js-text-rows" value="4" min="1" max="20">
            `;
            break;
        case 'checkbox':
            html = `
                <label>Question:</label>
                <input type="text" class="js-checkbox-question" value="Select all that apply to this document:" placeholder="Checkbox question">
                <label>Column Label (hidden from participant):</label>
                <input type="text" class="js-checkbox-column-label column-label-input" placeholder="e.g., pdf_${sectionId}_checkbox">
                <label>Options (one per line):</label>
                <textarea rows="4" class="js-checkbox-options" placeholder="Option 1\nOption 2\nOption 3"></textarea>
            `;
            break;
    }
    responseDetails.innerHTML = html;
}

//  Survey Toggle
function toggleSurveyEnabled(isEnabled) {
    const configContent = document.getElementById('survey-config-content');
    const toggleLabel = document.querySelector('.master-survey-toggle .toggle-label');
    const toggleDescription = document.querySelector('.master-survey-toggle .toggle-description');
    
    if (isEnabled) {
        configContent.classList.remove('disabled');
        toggleLabel.textContent = 'Enable Pre-Interaction Survey';
        toggleDescription.textContent = 'When disabled, users will go directly to chat without seeing the survey';
        
        // Save state
        localStorage.setItem('surveyEnabled', 'true');
        
        // Optional: Send to backend
        updateSurveyEnabledState(true);
    } else {
        configContent.classList.add('disabled');
        toggleLabel.textContent = 'Enable Pre-Interaction Survey';
        toggleDescription.textContent = 'Survey is currently DISABLED - users will skip directly to chat';
        
        // Save disabled state
        localStorage.setItem('surveyEnabled', 'false');
        
        // Optional: Send to backend
        updateSurveyEnabledState(false);
    }
}

// Load survey enabled state on page load
document.addEventListener('DOMContentLoaded', function() {
    // Pre-survey toggle initialization
    const surveyToggle = document.getElementById('survey-master-toggle');
    const savedState = localStorage.getItem('surveyEnabled');
    
    if (surveyToggle) {
        // Default to enabled if no saved state
        const isEnabled = savedState !== 'false';
        surveyToggle.checked = isEnabled;
        toggleSurveyEnabled(isEnabled);
    }
    
    // Post-survey toggle
    const postSurveyToggle = document.getElementById('post-survey-master-toggle');
    
    if (postSurveyToggle) {
        // Load post-survey enabled state from database
        fetch('/get-url-settings')
        .then(response => response.json())
        .then(data => {
            const isPostEnabled = data.use_post_survey || false;
            postSurveyToggle.checked = isPostEnabled;
            togglePostSurveyEnabled(isPostEnabled);
            
            // Also update localStorage to keep it in sync
            localStorage.setItem('postSurveyEnabled', isPostEnabled ? 'true' : 'false');
        })
        .catch(error => {
            console.error('Error loading post-survey state from database:', error);
            // Fallback to localStorage if database request fails
            const savedPostState = localStorage.getItem('postSurveyEnabled');
            const isPostEnabled = savedPostState !== 'false';
            postSurveyToggle.checked = isPostEnabled;
            togglePostSurveyEnabled(isPostEnabled);
        });
    }
});

// Optional: Send enabled state to Flask
function updateSurveyEnabledState(enabled) {
    fetch('/update-survey-enabled', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: enabled })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Survey enabled state updated:', data);
    })
    .catch(error => {
        console.error('Error updating survey enabled state:', error);
    });
}

// POST-INTERACTION SURVEY

// Post-Survey Toggle 
function togglePostSurveyEnabled(isEnabled) {
    const configContent = document.getElementById('post-survey-config-content');
    const toggleLabel = document.querySelector('.master-post-survey-toggle .toggle-label');
    const toggleDescription = document.querySelector('.master-post-survey-toggle .toggle-description');
    
    if (isEnabled) {
        configContent.classList.remove('disabled');
        toggleLabel.textContent = 'Enable Post-Interaction Survey';
        toggleDescription.textContent = 'When disabled, users will go directly to external URL after finishing chat';
        
        // Save enabled state
        localStorage.setItem('postSurveyEnabled', 'true');
        
        updatePostSurveyEnabledState(true);
    } else {
        configContent.classList.add('disabled');
        toggleLabel.textContent = 'Enable Post-Interaction Survey';
        toggleDescription.textContent = 'Post-survey is currently DISABLED - users will go directly to external URL';
        
        // Save disabled state
        localStorage.setItem('postSurveyEnabled', 'false');
        
        updatePostSurveyEnabledState(false);
    }
}

function updatePostSurveyEnabledState(enabled) {
    fetch('/update-post-survey-enabled', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: enabled })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Post-survey enabled state updated:', data);
    })
    .catch(error => {
        console.error('Error updating post-survey enabled state:', error);
    });
}

// Add Post-Survey Section
function addPostSurveySection() {
    const sectionTypeSelect = document.getElementById('post-section-type-select');
    const selectedType = sectionTypeSelect.value;
    
    if (!selectedType) {
        alert('Please select a section type');
        return;
    }
    
    const dynamicContainer = document.getElementById('post-dynamic-sections-container');
    const sectionId = selectedType + '-' + Date.now();
    
    let sectionHTML = '';
    
    switch (selectedType) {
        case 'demographics':
            sectionHTML = createDemographicsSection(sectionId);
            break;
        case 'likert':
            sectionHTML = createLikertSection(sectionId);
            break;
        case 'freetext':
            sectionHTML = createFreetextSection(sectionId);
            break;
        case 'checkbox':
            sectionHTML = createCheckboxSection(sectionId);
            break;
        case 'dropdown':
            sectionHTML = createDropdownSection(sectionId);
            break;
        case 'slider':
            sectionHTML = createSliderSection(sectionId);
            break;
        case 'image':
            sectionHTML = createImageSection(sectionId);
            break;
        case 'video':
            sectionHTML = createVideoSection(sectionId);
            break;
        case 'pdf':
            sectionHTML = createPDFSection(sectionId);
            break;
        case 'custom':
            sectionHTML = createCustomSection(sectionId);
            break;
    }
    
    if (sectionHTML) {
        const newSection = document.createElement('div');
        newSection.className = 'survey-section-config';
        newSection.setAttribute('data-section', sectionId);
        newSection.innerHTML = sectionHTML;
        dynamicContainer.appendChild(newSection);
    }
}

// Handle Post-Survey File Upload
function handlePostFileUpload(type) {
    const fileInput = document.getElementById(`post-${type}-file`);
    const file = fileInput.files[0];
    
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        fileInput.value = '';
        return;
    }
    
    uploadPostFormFile(file, type);
}

function uploadPostFormFile(file, type) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', `post_${type}`);
    
    const statusDiv = document.getElementById(`post-${type}-file-status`);
    statusDiv.innerHTML = '<span class="uploading">Uploading...</span>';
    
    fetch('/upload-form-file', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            statusDiv.innerHTML = `<span class="success">✓ Uploaded: ${data.filename}</span>`;
        } else {
            statusDiv.innerHTML = `<span class="error">✗ Error: ${data.error}</span>`;
        }
    })
    .catch(error => {
        statusDiv.innerHTML = '<span class="error">✗ Upload failed</span>';
        console.error('Upload error:', error);
    });
}

// Save Post-Survey Configuration
function savePostSurveyConfiguration() {
    console.log('Save post-survey configuration button clicked');
    const config = collectPostSurveyConfiguration();
    console.log('Collected post-survey config:', config);
    
    // Validate configuration before saving
    const validationError = validateSurveyConfiguration(config);
    if (validationError) {
        showFeedback('post-survey-feedback', validationError, 'error');
        return;
    }
    
    // Get the main survey config and update the post_survey section
    fetch('/get-survey-config')
    .then(response => {
        console.log('Get survey config response status:', response.status);
        return response.json();
    })
    .then(mainConfig => {
        console.log('Main config received:', mainConfig);
        
        // If main config doesn't exist, create it
        if (!mainConfig) {
            mainConfig = {
                title: 'Survey Form',
                information: { title: '', content: '' },
                consent: { content: '' },
                settings: {},
                sections: {}
            };
        }
        
        // Add post-survey configuration
        mainConfig.post_survey = config;
        console.log('Combined config to save:', mainConfig);
        
        // Save the combined configuration
        return fetch('/save-survey-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(mainConfig)
        });
    })
    .then(response => {
        console.log('Save response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Save response data:', data);
        if (data.success) {
            showFeedback('post-survey-feedback', 'Post-survey configuration saved successfully!', 'success');
        } else {
            showFeedback('post-survey-feedback', 'Error saving configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error saving post-survey configuration:', error);
        showFeedback('post-survey-feedback', 'Error saving configuration: ' + error.message, 'error');
    });
}

// Collect Post-Survey Configuration
function collectPostSurveyConfiguration() {
    console.log('Collecting post-survey configuration...');
    
    const masterToggle = document.getElementById('post-survey-master-toggle');
    const titleElement = document.getElementById('post-survey-title');
    const showProgressElement = document.getElementById('post-show-progress');
    const randomizeSectionsElement = document.getElementById('post-randomize-sections');
    const randomizeItemsElement = document.getElementById('post-randomize-items');
    const completionMessageElement = document.getElementById('completion-popup-message');
    const finishButtonElement = document.getElementById('finish-button-text');
    
    console.log('Form elements found:', {
        masterToggle: !!masterToggle,
        titleElement: !!titleElement,
        showProgressElement: !!showProgressElement,
        randomizeSectionsElement: !!randomizeSectionsElement,
        randomizeItemsElement: !!randomizeItemsElement,
        completionMessageElement: !!completionMessageElement,
        finishButtonElement: !!finishButtonElement
    });
    
    const config = {
        enabled: masterToggle ? masterToggle.checked : false,
        title: titleElement ? titleElement.value : 'Post-Interaction Survey',
        settings: {
            showProgress: showProgressElement ? showProgressElement.checked : true,
            randomizeSections: randomizeSectionsElement ? randomizeSectionsElement.checked : false,
            randomizeItems: randomizeItemsElement ? randomizeItemsElement.checked : false
        },
        completion_settings: {
            completion_popup_message: completionMessageElement ? completionMessageElement.value : 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx',
            finish_button_text: finishButtonElement ? finishButtonElement.value : 'Finish'
        },
        sections: {}
    };
    
    console.log('Collected basic config:', config);
    
    // Collect configuration from all dynamic sections
    const dynamicSections = document.querySelectorAll('#post-dynamic-sections-container .survey-section-config');
    console.log('Found dynamic sections:', dynamicSections.length);
    
    dynamicSections.forEach(sectionElement => {
        const sectionId = sectionElement.getAttribute('data-section');
        const enableCheckbox = sectionElement.querySelector(`#enable-${sectionId}`);
        
        // Skip if section is not enabled
        if (!enableCheckbox || !enableCheckbox.checked) {
            console.log(`Skipping section ${sectionId} - not enabled`);
            return;
        }
        
        const sectionType = sectionId.split('-')[0];
        const titleInput = sectionElement.querySelector('.section-content > input[type="text"]') || sectionElement.querySelector('input[type="text"]');
        
        console.log(`Processing section ${sectionId} of type ${sectionType}`);
        
        // Basic demographics section collection
        if (sectionType === 'demographics') {
            const ageCheckbox = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="checkbox"]');
            const genderCheckbox = sectionElement.querySelector('.demographics-fields .field-config:nth-child(2) input[type="checkbox"]');
            const ageMinInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:first-of-type');
            const ageMaxInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:last-of-type');
            const genderOptionsInput = sectionElement.querySelector('.gender-options input[type="text"]');
            
            const ageColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="age"]');
            const genderColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="gender"]');

            config.sections[sectionId] = {
                type: 'demographics',
                enabled: true,
                title: titleInput ? titleInput.value : 'Demographics',
                fields: {
                    age: {
                        enabled: ageCheckbox ? ageCheckbox.checked : false,
                        min: ageMinInput ? ageMinInput.value : '18',
                        max: ageMaxInput ? ageMaxInput.value : '99',
                        column_label: ageColumnLabelInput ? ageColumnLabelInput.value.trim() : ''
                    },
                    gender: {
                        enabled: genderCheckbox ? genderCheckbox.checked : false,
                        options: genderOptionsInput ? genderOptionsInput.value.split(',').map(s => s.trim()) : [],
                        column_label: genderColumnLabelInput ? genderColumnLabelInput.value.trim() : ''
                    }
                }
            };
        } else if (sectionType === 'likert') {
            const likertItems = [];
            const scaleTypeSelect = sectionElement.querySelector('.likert-scale-type');
            const scaleLabelsInput = sectionElement.querySelector('.scale-labels');

            sectionElement.querySelectorAll('.likert-items .likert-item').forEach(itemDiv => {
                const statementInput = itemDiv.querySelector('.likert-statement-input') || itemDiv.querySelector('input[type="text"]');
                const columnLabelInput = itemDiv.querySelector('.column-label-input');
                const statement = statementInput ? statementInput.value.trim() : '';
                if (!statement) return;
                const itemId = itemDiv.getAttribute('data-item-id') || generateInternalId('likert');
                likertItems.push({
                    id: itemId,
                    statement: statement,
                    column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                });
            });
            
            config.sections[sectionId] = {
                type: 'likert',
                enabled: true,
                title: titleInput ? titleInput.value : 'Likert Scale Items',
                scaleType: scaleTypeSelect ? scaleTypeSelect.value : '5-point-agreement',
                scaleLabels: scaleLabelsInput ? scaleLabelsInput.value : '',
                items: likertItems
            };
        } else if (sectionType === 'freetext') {
            const freetextQuestions = [];
            
            sectionElement.querySelectorAll('.freetext-questions .freetext-question').forEach(questionDiv => {
                const questionInput = questionDiv.querySelector('.freetext-question-input') || questionDiv.querySelector('input[type="text"]');
                const columnLabelInput = questionDiv.querySelector('.column-label-input');
                const rowsInput = questionDiv.querySelector('.freetext-rows-input') || questionDiv.querySelector('input[type="number"]');
                const questionText = questionInput ? questionInput.value.trim() : '';
                const rows = rowsInput ? rowsInput.value : '';
                if (questionText) {
                    freetextQuestions.push({
                        id: questionDiv.getAttribute('data-question-id') || generateInternalId('freetext'),
                        question: questionText,
                        rows: parseInt(rows) || 4,
                        column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                    });
                }
            });
            
            config.sections[sectionId] = {
                type: 'freetext',
                enabled: true,
                title: titleInput ? titleInput.value : 'Free Form Text',
                questions: freetextQuestions
            };
        } else if (sectionType === 'custom') {
            const customFields = [];
            const descriptionTextarea = sectionElement.querySelector('textarea');
            
            sectionElement.querySelectorAll('.custom-fields .field-config').forEach(fieldDiv => {
                const labelInput = fieldDiv.querySelector('.js-custom-label') || fieldDiv.querySelector('input[type="text"]:first-of-type');
                const typeSelect = fieldDiv.querySelector('select');
                const optionsInput = fieldDiv.querySelector('.js-custom-options') || fieldDiv.querySelectorAll('input[type="text"]')[1];
                const requiredCheckbox = fieldDiv.querySelector('input[type="checkbox"]');
                const columnLabelInput = fieldDiv.querySelector('.js-custom-column-label') || fieldDiv.querySelector('.column-label-input');
                
                if (labelInput && labelInput.value.trim()) {
                    customFields.push({
                        label: labelInput.value.trim(),
                        type: typeSelect ? typeSelect.value : 'text',
                        options: optionsInput ? optionsInput.value : '',
                        required: requiredCheckbox ? requiredCheckbox.checked : false,
                        column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                    });
                }
            });
            
            config.sections[sectionId] = {
                type: 'custom',
                enabled: true,
                title: titleInput ? titleInput.value : 'Custom Section',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                fields: customFields
            };
        } else if (sectionType === 'checkbox') {
            const options = [];
            const sectionTextInputs = sectionElement.querySelectorAll('.section-content > input[type="text"]');
            const questionInput = sectionTextInputs[1];
            const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
            
            sectionElement.querySelectorAll('.checkbox-options .option-item input[type="text"]').forEach(input => {
                if (input.value.trim()) {
                    options.push(input.value.trim());
                }
            });
            
            config.sections[sectionId] = {
                type: 'checkbox',
                enabled: true,
                title: titleInput ? titleInput.value : 'Multiple Choice Selection',
                question: questionInput ? questionInput.value : 'Please select all that apply:',
                options: options,
                column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
            };
        } else if (sectionType === 'dropdown') {
            const options = [];
            const sectionTextInputs = sectionElement.querySelectorAll('.section-content > input[type="text"]');
            const questionInput = sectionTextInputs[1];
            const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
            const requiredCheckbox = sectionElement.querySelector('.section-content > input[type="checkbox"]');
            
            sectionElement.querySelectorAll('.dropdown-options .option-item input[type="text"]').forEach(input => {
                if (input.value.trim()) {
                    options.push(input.value.trim());
                }
            });
            
            config.sections[sectionId] = {
                type: 'dropdown',
                enabled: true,
                title: titleInput ? titleInput.value : 'Selection',
                question: questionInput ? questionInput.value : 'Please select an option:',
                required: requiredCheckbox ? requiredCheckbox.checked : false,
                options: options,
                column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
            };
        } else if (sectionType === 'slider') {
            const sectionTextInputs = sectionElement.querySelectorAll('.section-content > input[type="text"]');
            const questionInput = sectionTextInputs[1];
            const columnLabelInput = sectionElement.querySelector('.section-content > input.column-label-input');
            const requiredCheckbox = sectionElement.querySelector('.section-content > input[type="checkbox"]');
            const sliderTypeRadio = sectionElement.querySelector(`input[name="slider-type-${sectionId}"]:checked`);
            const sliderType = sliderTypeRadio ? sliderTypeRadio.value : 'labels';
            
            let sliderConfig = {
                type: 'slider',
                enabled: true,
                title: titleInput ? titleInput.value : 'Rating Scale',
                question: questionInput ? questionInput.value : 'Please rate using the slider:',
                required: requiredCheckbox ? requiredCheckbox.checked : false,
                slider_type: sliderType,
                column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
            };
            
            if (sliderType === 'labels') {
                const labelInputs = sectionElement.querySelectorAll('.label-config input[type="text"]');
                const stepInput = sectionElement.querySelector('.label-config input[type="number"]:nth-of-type(1)');
                const defaultInput = sectionElement.querySelector('.label-config input[type="number"]:nth-of-type(2)');
                
                sliderConfig.left_label = labelInputs[0] ? labelInputs[0].value : 'Strongly Disagree';
                sliderConfig.right_label = labelInputs[1] ? labelInputs[1].value : 'Strongly Agree';
                sliderConfig.steps = stepInput ? parseInt(stepInput.value) : 7;
                sliderConfig.default_value = defaultInput ? parseInt(defaultInput.value) : 4;
            } else {
                const numericInputs = sectionElement.querySelectorAll('.numeric-config input[type="number"]');
                
                sliderConfig.min_value = numericInputs[0] ? parseInt(numericInputs[0].value) : 0;
                sliderConfig.max_value = numericInputs[1] ? parseInt(numericInputs[1].value) : 100;
                sliderConfig.default_value = numericInputs[2] ? parseInt(numericInputs[2].value) : 50;
            }
            
            config.sections[sectionId] = sliderConfig;
        } else if (sectionType === 'image') {
            const descriptionTextarea = sectionElement.querySelector('textarea');
            const fileInput = sectionElement.querySelector(`#image-upload-${sectionId}`);
            const altTextInput = sectionElement.querySelector('.image-alt-text input[type="text"]');
            const displaySizeSelect = sectionElement.querySelectorAll('select')[0];
            const alignmentSelect = sectionElement.querySelectorAll('select')[1];
            const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
            const responseTypeSelect = sectionElement.querySelector('.response-config select');

            let imageConfig = {
                type: 'image',
                enabled: true,
                title: titleInput ? titleInput.value : 'Image Display',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                alt_text: altTextInput ? altTextInput.value : 'Image',
                display_size: displaySizeSelect ? displaySizeSelect.value : 'medium',
                alignment: alignmentSelect ? alignmentSelect.value : 'center',
                require_response: requireResponseCheckbox ? requireResponseCheckbox.checked : false
            };

            const filePath = fileInput ? fileInput.getAttribute('data-file-path') : null;
            if (filePath) {
                imageConfig.file_path = filePath;
            } else if (fileInput && fileInput.files.length > 0) {
                imageConfig.file_name = fileInput.files[0].name;
            }

            if (imageConfig.require_response && responseTypeSelect) {
                imageConfig.response_type = responseTypeSelect.value;
                const responseDetails = sectionElement.querySelector('.response-details');
                if (responseDetails) {
                    if (imageConfig.response_type === 'rating') {
                        imageConfig.rating_question = getInputValue(responseDetails.querySelector('.js-rating-question')) || 'How would you rate this image?';
                        imageConfig.rating_scale = parseInt(getInputValue(responseDetails.querySelector('.js-rating-scale')) || '10') || 10;
                        imageConfig.rating_column_label = getInputValue(responseDetails.querySelector('.js-rating-column-label')) || '';
                    } else if (imageConfig.response_type === 'text') {
                        imageConfig.text_question = getInputValue(responseDetails.querySelector('.js-text-question')) || 'What are your thoughts about this image?';
                        imageConfig.text_rows = parseInt(getInputValue(responseDetails.querySelector('.js-text-rows')) || '4') || 4;
                        imageConfig.text_column_label = getInputValue(responseDetails.querySelector('.js-text-column-label')) || '';
                    } else if (imageConfig.response_type === 'checkbox') {
                        imageConfig.checkbox_question = getInputValue(responseDetails.querySelector('.js-checkbox-question')) || 'Select all that apply to this image:';
                        const checkboxOptionsText = getInputValue(responseDetails.querySelector('.js-checkbox-options')) || '';
                        imageConfig.checkbox_options = checkboxOptionsText.split('\n').filter(o => o.trim());
                        imageConfig.checkbox_column_label = getInputValue(responseDetails.querySelector('.js-checkbox-column-label')) || '';
                    }
                }
            }

            config.sections[sectionId] = imageConfig;
        } else if (sectionType === 'video') {
            const descriptionTextarea = sectionElement.querySelector('textarea');
            const fileInput = sectionElement.querySelector(`#video-upload-${sectionId}`);
            const urlInput = sectionElement.querySelector('.video-url-section input[type="url"]');
            const sourceTypeSelect = sectionElement.querySelector('.video-source-options select');
            const videoSizeSelect = sectionElement.querySelectorAll('select')[1];
            const autoplayCheckbox = sectionElement.querySelector(`#autoplay-${sectionId}`);
            const controlsCheckbox = sectionElement.querySelector(`#controls-${sectionId}`);
            const loopCheckbox = sectionElement.querySelector(`#loop-${sectionId}`);
            const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
            const responseTypeSelect = sectionElement.querySelector('.response-config select');

            let videoConfig = {
                type: 'video',
                enabled: true,
                title: titleInput ? titleInput.value : 'Video Display',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                video_size: videoSizeSelect ? videoSizeSelect.value : 'medium',
                autoplay: autoplayCheckbox ? autoplayCheckbox.checked : false,
                controls: controlsCheckbox ? controlsCheckbox.checked : true,
                loop: loopCheckbox ? loopCheckbox.checked : false,
                require_response: requireResponseCheckbox ? requireResponseCheckbox.checked : false
            };

            if (sourceTypeSelect && sourceTypeSelect.value === 'url' && urlInput) {
                videoConfig.video_url = urlInput.value;
            } else {
                const filePath = fileInput ? fileInput.getAttribute('data-file-path') : null;
                if (filePath) {
                    videoConfig.file_path = filePath;
                } else if (fileInput && fileInput.files.length > 0) {
                    videoConfig.file_name = fileInput.files[0].name;
                }
            }

            if (videoConfig.require_response && responseTypeSelect) {
                videoConfig.response_type = responseTypeSelect.value;
                const responseDetails = sectionElement.querySelector('.response-details');
                if (responseDetails) {
                    if (videoConfig.response_type === 'rating') {
                        videoConfig.rating_question = getInputValue(responseDetails.querySelector('.js-rating-question')) || 'How would you rate this video?';
                        videoConfig.rating_scale = parseInt(getInputValue(responseDetails.querySelector('.js-rating-scale')) || '10') || 10;
                        videoConfig.rating_column_label = getInputValue(responseDetails.querySelector('.js-rating-column-label')) || '';
                    } else if (videoConfig.response_type === 'text') {
                        videoConfig.text_question = getInputValue(responseDetails.querySelector('.js-text-question')) || 'What are your thoughts about this video?';
                        videoConfig.text_rows = parseInt(getInputValue(responseDetails.querySelector('.js-text-rows')) || '4') || 4;
                        videoConfig.text_column_label = getInputValue(responseDetails.querySelector('.js-text-column-label')) || '';
                    } else if (videoConfig.response_type === 'checkbox') {
                        videoConfig.checkbox_question = getInputValue(responseDetails.querySelector('.js-checkbox-question')) || 'Select all that apply to this video:';
                        const checkboxOptionsText = getInputValue(responseDetails.querySelector('.js-checkbox-options')) || '';
                        videoConfig.checkbox_options = checkboxOptionsText.split('\n').filter(o => o.trim());
                        videoConfig.checkbox_column_label = getInputValue(responseDetails.querySelector('.js-checkbox-column-label')) || '';
                    }
                }
            }

            config.sections[sectionId] = videoConfig;
        } else if (sectionType === 'pdf') {
            const descriptionTextarea = sectionElement.querySelector('textarea');
            const fileInput = sectionElement.querySelector(`#pdf-upload-${sectionId}`);
            const displayHeightSelect = sectionElement.querySelectorAll('select')[0];
            const displayModeSelect = sectionElement.querySelectorAll('select')[1];
            const allowDownloadCheckbox = sectionElement.querySelector(`#allow-download-${sectionId}`);
            const requireViewCheckbox = sectionElement.querySelector(`#require-view-${sectionId}`);
            const requireResponseCheckbox = sectionElement.querySelector(`#require-response-${sectionId}`);
            const responseTypeSelect = sectionElement.querySelector('.response-config select');

            let pdfConfig = {
                type: 'pdf',
                enabled: true,
                title: titleInput ? titleInput.value : 'PDF Display',
                description: descriptionTextarea ? descriptionTextarea.value : '',
                display_height: displayHeightSelect ? displayHeightSelect.value : '600',
                display_mode: displayModeSelect ? displayModeSelect.value : 'embed',
                allow_download: allowDownloadCheckbox ? allowDownloadCheckbox.checked : true,
                require_view: requireViewCheckbox ? requireViewCheckbox.checked : false,
                require_response: requireResponseCheckbox ? requireResponseCheckbox.checked : false
            };

            const filePath = fileInput ? fileInput.getAttribute('data-file-path') : null;
            if (filePath) {
                pdfConfig.file_path = filePath;
            } else if (fileInput && fileInput.files.length > 0) {
                pdfConfig.file_name = fileInput.files[0].name;
            }

            if (pdfConfig.require_response && responseTypeSelect) {
                pdfConfig.response_type = responseTypeSelect.value;
                const responseDetails = sectionElement.querySelector('.response-details');
                if (responseDetails) {
                    if (pdfConfig.response_type === 'confirmation') {
                        pdfConfig.confirmation_text = getInputValue(responseDetails.querySelector('.js-confirmation-text')) || 'I have read and understood the document';
                        pdfConfig.confirmation_column_label = getInputValue(responseDetails.querySelector('.js-confirmation-column-label')) || '';
                    } else if (pdfConfig.response_type === 'rating') {
                        pdfConfig.rating_question = getInputValue(responseDetails.querySelector('.js-rating-question')) || 'How would you rate this document?';
                        pdfConfig.rating_scale = parseInt(getInputValue(responseDetails.querySelector('.js-rating-scale')) || '10') || 10;
                        pdfConfig.rating_column_label = getInputValue(responseDetails.querySelector('.js-rating-column-label')) || '';
                    } else if (pdfConfig.response_type === 'text') {
                        pdfConfig.text_question = getInputValue(responseDetails.querySelector('.js-text-question')) || 'What are your thoughts about this document?';
                        pdfConfig.text_rows = parseInt(getInputValue(responseDetails.querySelector('.js-text-rows')) || '4') || 4;
                        pdfConfig.text_column_label = getInputValue(responseDetails.querySelector('.js-text-column-label')) || '';
                    } else if (pdfConfig.response_type === 'checkbox') {
                        pdfConfig.checkbox_question = getInputValue(responseDetails.querySelector('.js-checkbox-question')) || 'Select all that apply to this document:';
                        const checkboxOptionsText = getInputValue(responseDetails.querySelector('.js-checkbox-options')) || '';
                        pdfConfig.checkbox_options = checkboxOptionsText.split('\n').filter(o => o.trim());
                        pdfConfig.checkbox_column_label = getInputValue(responseDetails.querySelector('.js-checkbox-column-label')) || '';
                    }
                }
            }

            config.sections[sectionId] = pdfConfig;
        }
        // Add more section types as needed following the same pattern as the main survey
    });
    
    console.log('Final collected config:', config);
    return config;
}

// Validation function for survey configurations
function validateSurveyConfiguration(config) {
    // Check if there are any enabled sections
    const enabledSections = Object.values(config.sections || {}).filter(section => section.enabled);
    
    if (enabledSections.length === 0) {
        return 'At least one survey section must be enabled and configured.';
    }
    
    // Validate each enabled section
    for (const [sectionId, section] of Object.entries(config.sections || {})) {
        if (!section.enabled) continue;
        
        if (section.type === 'likert') {
            // Validate Likert scale configuration
            if (!section.scaleType || section.scaleType === '') {
                return `Likert section "${section.title}" must have a scale type selected.`;
            }
            
            if (!section.scaleLabels || section.scaleLabels.trim() === '') {
                return `Likert section "${section.title}" must have scale labels defined.`;
            }
            
            if (!section.items || section.items.length === 0) {
                return `Likert section "${section.title}" must have at least one item/statement.`;
            }
        }
        
        if (section.type === 'slider') {
            // Validate slider configuration
            if (!section.slider_type) {
                return `Slider section "${section.title}" must have a slider type selected (labels or numeric).`;
            }
            
            if (section.slider_type === 'labels') {
                if (!section.left_label || section.left_label.trim() === '') {
                    return `Slider section "${section.title}" must have a left label defined.`;
                }
                if (!section.right_label || section.right_label.trim() === '') {
                    return `Slider section "${section.title}" must have a right label defined.`;
                }
                if (!section.steps || section.steps < 2 || section.steps > 20) {
                    return `Slider section "${section.title}" must have steps between 2 and 20.`;
                }
            } else if (section.slider_type === 'numeric') {
                if (section.min_value === undefined || section.max_value === undefined) {
                    return `Slider section "${section.title}" must have min and max values defined.`;
                }
                if (section.min_value >= section.max_value) {
                    return `Slider section "${section.title}" min value must be less than max value.`;
                }
            }
        }
        
        if (section.type === 'dropdown' || section.type === 'checkbox') {
            // Validate dropdown/checkbox options
            if (!section.options || section.options.length === 0) {
                return `${section.type === 'dropdown' ? 'Dropdown' : 'Checkbox'} section "${section.title}" must have at least one option.`;
            }
        }
        
        if (section.type === 'freetext') {
            // Validate freetext questions
            if (!section.questions || section.questions.length === 0) {
                return `Free text section "${section.title}" must have at least one question.`;
            }
        }
        
        if (section.type === 'demographics') {
            // Validate demographics fields
            const hasEnabledField = (section.fields?.age?.enabled) || (section.fields?.gender?.enabled);
            if (!hasEnabledField) {
                return `Demographics section "${section.title}" must have at least one field enabled.`;
            }
        }
    }
    
    return null;
}

// Load Post-Survey Configuration
function loadPostSurveyConfiguration(showFeedbackMessage = false) {
    fetch('/get-survey-config')
    .then(response => response.json())
    .then(mainConfig => {
        if (mainConfig && mainConfig.post_survey) {
            populatePostSurveyForm(mainConfig.post_survey);
            if (showFeedbackMessage) {
                showFeedback('post-survey-feedback', 'Configuration loaded successfully!', 'success');
            }
        } else {
            if (showFeedbackMessage) {
                showFeedback('post-survey-feedback', 'No saved post-survey configuration found', 'info');
            }
        }
    })
    .catch(error => {
        console.error('Error loading post-survey configuration:', error);
        if (showFeedbackMessage) {
            showFeedback('post-survey-feedback', 'Error loading configuration', 'error');
        }
    });
}

// Populate Post-Survey Form
function populatePostSurveyForm(config) {
    document.getElementById('post-survey-title').value = config.title || 'Post-Interaction Survey';
    
    document.getElementById('post-show-progress').checked = config.settings?.showProgress !== false;
    document.getElementById('post-randomize-sections').checked = config.settings?.randomizeSections === true;
    document.getElementById('post-randomize-items').checked = config.settings?.randomizeItems === true;
    
    if (config.completion_settings) {
        document.getElementById('completion-popup-message').value = config.completion_settings.completion_popup_message || 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx';
        document.getElementById('finish-button-text').value = config.completion_settings.finish_button_text || 'Finish';
    }
    
    document.getElementById('post-survey-master-toggle').checked = config.enabled !== false;
    togglePostSurveyEnabled(config.enabled !== false);
    
    // Clear existing dynamic sections
    const dynamicContainer = document.getElementById('post-dynamic-sections-container');
    dynamicContainer.innerHTML = '';
    
    // Populate dynamic sections if they exist
    if (config.sections) {
        Object.keys(config.sections).forEach(sectionId => {
            const sectionConfig = config.sections[sectionId];
            if (!sectionConfig.enabled) return;
            
            // Create the section based on its type
            let sectionHTML = '';
            
            switch (sectionConfig.type) {
                case 'demographics':
                    sectionHTML = createDemographicsSection(sectionId);
                    break;
                case 'likert':
                    sectionHTML = createLikertSection(sectionId);
                    break;
                case 'freetext':
                    sectionHTML = createFreetextSection(sectionId);
                    break;
                case 'checkbox':
                    sectionHTML = createCheckboxSection(sectionId);
                    break;
                case 'dropdown':
                    sectionHTML = createDropdownSection(sectionId);
                    break;
                case 'slider':
                    sectionHTML = createSliderSection(sectionId);
                    break;
                case 'custom':
                    sectionHTML = createCustomSection(sectionId);
                    break;
                case 'image':
                    sectionHTML = createImageSection(sectionId);
                    break;
                case 'video':
                    sectionHTML = createVideoSection(sectionId);
                    break;
                case 'pdf':
                    sectionHTML = createPDFSection(sectionId);
                    break;
            }
            
            if (sectionHTML) {
                const newSection = document.createElement('div');
                newSection.className = 'survey-section-config';
                newSection.setAttribute('data-section', sectionId);
                newSection.innerHTML = sectionHTML;
                dynamicContainer.appendChild(newSection);
                
                // Populate section-specific data
                setTimeout(() => {
                    populateSectionData(sectionId, sectionConfig);
                }, 100);
            }
        });
    }
}

// Preview Post-Survey
function previewPostSurvey() {
    console.log('Preview post-survey button clicked');
    const config = collectPostSurveyConfiguration();
    console.log('Collected post-survey config:', config);
    
    fetch('/preview-post-survey', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
    })
    .then(response => {
        console.log('Preview response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
    })
    .then(html => {
        console.log('Preview HTML received, length:', html.length);
        const preview = document.getElementById('post-survey-preview');
        const iframe = document.getElementById('post-survey-preview-iframe');
        iframe.srcdoc = html;
        preview.style.display = 'block';
        preview.scrollIntoView({ behavior: 'smooth' });
        showFeedback('post-survey-feedback', 'Preview generated successfully!', 'success');
    })
    .catch(error => {
        console.error('Error generating post-survey preview:', error);
        showFeedback('post-survey-feedback', 'Error generating preview: ' + error.message, 'error');
    });
}

// Reset Post-Survey to default
function resetPostSurveyToDefault() {
    if (confirm('Are you sure you want to reset the post-survey to default settings?')) {
        document.getElementById('post-survey-title').value = 'Post-Interaction Survey';
        document.getElementById('post-show-progress').checked = true;
        document.getElementById('post-randomize-sections').checked = false;
        document.getElementById('post-randomize-items').checked = false;
        document.getElementById('completion-popup-message').value = 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx';
        document.getElementById('finish-button-text').value = 'Finish';
        
        document.getElementById('post-dynamic-sections-container').innerHTML = '';
        
        showFeedback('post-survey-feedback', 'Post-survey configuration reset to defaults!', 'success');
    }
}

// POST-INTERACTION SURVEY 2

function togglePostSurvey2Enabled(isEnabled) {
    const configContent = document.getElementById('post2-survey-config-content');
    const toggleLabel = document.querySelector('.master-post2-survey-toggle .toggle-label');
    const toggleDescription = document.querySelector('.master-post2-survey-toggle .toggle-description');

    if (!configContent) return;

    if (isEnabled) {
        configContent.classList.remove('disabled');
        if (toggleLabel) toggleLabel.textContent = 'Enable Post Interaction Survey 2';
        if (toggleDescription) toggleDescription.textContent = 'Configure the second post-interaction survey (shown after interaction 2)';
        localStorage.setItem('postSurvey2Enabled', 'true');
    } else {
        configContent.classList.add('disabled');
        if (toggleLabel) toggleLabel.textContent = 'Enable Post Interaction Survey 2';
        if (toggleDescription) toggleDescription.textContent = 'Post interaction survey 2 is currently DISABLED';
        localStorage.setItem('postSurvey2Enabled', 'false');
    }
}

function addPostSurvey2Section() {
    const sectionTypeSelect = document.getElementById('post2-section-type-select');
    const selectedType = sectionTypeSelect ? sectionTypeSelect.value : '';
    if (!selectedType) {
        alert('Please select a section type');
        return;
    }

    const dynamicContainer = document.getElementById('post2-dynamic-sections-container');
    const sectionId = selectedType + '-' + Date.now();

    let sectionHTML = '';
    switch (selectedType) {
        case 'demographics':
            sectionHTML = createDemographicsSection(sectionId);
            break;
        case 'likert':
            sectionHTML = createLikertSection(sectionId);
            break;
        case 'freetext':
            sectionHTML = createFreetextSection(sectionId);
            break;
        case 'checkbox':
            sectionHTML = createCheckboxSection(sectionId);
            break;
        case 'dropdown':
            sectionHTML = createDropdownSection(sectionId);
            break;
        case 'slider':
            sectionHTML = createSliderSection(sectionId);
            break;
        case 'image':
            sectionHTML = createImageSection(sectionId);
            break;
        case 'video':
            sectionHTML = createVideoSection(sectionId);
            break;
        case 'pdf':
            sectionHTML = createPDFSection(sectionId);
            break;
        case 'custom':
            sectionHTML = createCustomSection(sectionId);
            break;
    }

    if (sectionHTML && dynamicContainer) {
        const newSection = document.createElement('div');
        newSection.className = 'survey-section-config';
        newSection.setAttribute('data-section', sectionId);
        newSection.innerHTML = sectionHTML;
        dynamicContainer.appendChild(newSection);
    }
}

function collectPostSurvey2Configuration() {
    const masterToggle = document.getElementById('post2-survey-master-toggle');
    const titleElement = document.getElementById('post2-survey-title');
    const showProgressElement = document.getElementById('post2-show-progress');
    const randomizeSectionsElement = document.getElementById('post2-randomize-sections');
    const randomizeItemsElement = document.getElementById('post2-randomize-items');
    const completionMessageElement = document.getElementById('post2-completion-popup-message');
    const finishButtonElement = document.getElementById('post2-finish-button-text');

    const config = {
        enabled: masterToggle ? masterToggle.checked : false,
        title: titleElement ? titleElement.value : 'Post Interaction Survey 2',
        settings: {
            showProgress: showProgressElement ? showProgressElement.checked : true,
            randomizeSections: randomizeSectionsElement ? randomizeSectionsElement.checked : false,
            randomizeItems: randomizeItemsElement ? randomizeItemsElement.checked : false
        },
        completion_settings: {
            completion_popup_message: completionMessageElement ? completionMessageElement.value : 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx',
            finish_button_text: finishButtonElement ? finishButtonElement.value : 'Finish'
        },
        sections: {}
    };

    const dynamicSections = document.querySelectorAll('#post2-dynamic-sections-container .survey-section-config');
    dynamicSections.forEach(sectionElement => {
        const sectionId = sectionElement.getAttribute('data-section');
        const enableCheckbox = sectionElement.querySelector(`#enable-${sectionId}`);
        if (!enableCheckbox || !enableCheckbox.checked) {
            return;
        }

        const sectionType = sectionId.split('-')[0];
        const titleInput = sectionElement.querySelector('.section-content > input[type="text"]') || sectionElement.querySelector('input[type="text"]');

        if (sectionType === 'demographics') {
            const ageCheckbox = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="checkbox"]');
            const genderCheckbox = sectionElement.querySelector('.demographics-fields .field-config:nth-child(2) input[type="checkbox"]');
            const ageMinInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:first-of-type');
            const ageMaxInput = sectionElement.querySelector('.demographics-fields .field-config:first-child input[type="number"]:last-of-type');
            const genderOptionsInput = sectionElement.querySelector('.gender-options input[type="text"]');

            const ageColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="age"]');
            const genderColumnLabelInput = sectionElement.querySelector('.column-label-input[data-field="gender"]');

            config.sections[sectionId] = {
                type: 'demographics',
                enabled: true,
                title: titleInput ? titleInput.value : 'Demographics',
                fields: {
                    age: {
                        enabled: ageCheckbox ? ageCheckbox.checked : false,
                        min: ageMinInput ? ageMinInput.value : '18',
                        max: ageMaxInput ? ageMaxInput.value : '99',
                        column_label: ageColumnLabelInput ? ageColumnLabelInput.value.trim() : ''
                    },
                    gender: {
                        enabled: genderCheckbox ? genderCheckbox.checked : false,
                        options: genderOptionsInput ? genderOptionsInput.value.split(',').map(s => s.trim()) : [],
                        column_label: genderColumnLabelInput ? genderColumnLabelInput.value.trim() : ''
                    }
                }
            };
        } else if (sectionType === 'likert') {
            const likertItems = [];
            const scaleTypeSelect = sectionElement.querySelector('.likert-scale-type');
            const scaleLabelsInput = sectionElement.querySelector('.scale-labels');

            sectionElement.querySelectorAll('.likert-items .likert-item').forEach(itemDiv => {
                const statementInput = itemDiv.querySelector('.likert-statement-input') || itemDiv.querySelector('input[type="text"]');
                const columnLabelInput = itemDiv.querySelector('.column-label-input');
                const statement = statementInput ? statementInput.value.trim() : '';
                if (!statement) return;
                const itemId = itemDiv.getAttribute('data-item-id') || generateInternalId('likert');
                likertItems.push({
                    id: itemId,
                    statement: statement,
                    column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                });
            });

            config.sections[sectionId] = {
                type: 'likert',
                enabled: true,
                title: titleInput ? titleInput.value : 'Likert Scale Items',
                scaleType: scaleTypeSelect ? scaleTypeSelect.value : '5-point-agreement',
                scaleLabels: scaleLabelsInput ? scaleLabelsInput.value : '',
                items: likertItems
            };
        } else if (sectionType === 'freetext') {
            const freetextQuestions = [];
            sectionElement.querySelectorAll('.freetext-questions .freetext-question').forEach(questionDiv => {
                const questionInput = questionDiv.querySelector('.freetext-question-input') || questionDiv.querySelector('input[type="text"]');
                const columnLabelInput = questionDiv.querySelector('.column-label-input');
                const rowsInput = questionDiv.querySelector('.freetext-rows-input') || questionDiv.querySelector('input[type="number"]');
                const questionText = questionInput ? questionInput.value.trim() : '';
                const rows = rowsInput ? rowsInput.value : '';
                if (questionText) {
                    freetextQuestions.push({
                        id: questionDiv.getAttribute('data-question-id') || generateInternalId('freetext'),
                        question: questionText,
                        rows: parseInt(rows) || 4,
                        column_label: columnLabelInput ? columnLabelInput.value.trim() : ''
                    });
                }
            });
            config.sections[sectionId] = {
                type: 'freetext',
                enabled: true,
                title: titleInput ? titleInput.value : 'Free Form Text',
                questions: freetextQuestions
            };
        } else if (sectionType === 'custom') {
            const contentElement = sectionElement.querySelector('textarea');
            const columnLabelElement = sectionElement.querySelector('.column-label-input');
            config.sections[sectionId] = {
                type: 'custom',
                enabled: true,
                title: titleInput ? titleInput.value : 'Custom Content',
                content: contentElement ? contentElement.value : '',
                column_label: columnLabelElement ? columnLabelElement.value.trim() : ''
            };
        } else if (sectionType === 'checkbox' || sectionType === 'dropdown') {
            const questionElement = sectionElement.querySelector('input[type="text"]');
            const optionsElement = sectionElement.querySelector('textarea');
            const columnLabelElement = sectionElement.querySelector('.column-label-input');
            config.sections[sectionId] = {
                type: sectionType,
                enabled: true,
                title: titleInput ? titleInput.value : (sectionType === 'checkbox' ? 'Multiple Choice' : 'Dropdown'),
                question: questionElement ? questionElement.value : '',
                options: optionsElement ? optionsElement.value.split('\n').filter(opt => opt.trim()) : [],
                column_label: columnLabelElement ? columnLabelElement.value.trim() : ''
            };
        } else if (sectionType === 'slider') {
            const questionElement = sectionElement.querySelector('input[type="text"]');
            const minLabelElement = sectionElement.querySelector('.slider-min-label');
            const maxLabelElement = sectionElement.querySelector('.slider-max-label');
            const columnLabelElement = sectionElement.querySelector('.column-label-input');
            config.sections[sectionId] = {
                type: 'slider',
                enabled: true,
                title: titleInput ? titleInput.value : 'Slider Scale',
                question: questionElement ? questionElement.value : '',
                minLabel: minLabelElement ? minLabelElement.value : 'Low',
                maxLabel: maxLabelElement ? maxLabelElement.value : 'High',
                column_label: columnLabelElement ? columnLabelElement.value.trim() : ''
            };
        } else if (sectionType === 'image') {
            const filePathInput = sectionElement.querySelector('.file-path-input');
            const altTextInput = sectionElement.querySelector('.alt-text-input');
            config.sections[sectionId] = {
                type: 'image',
                enabled: true,
                title: titleInput ? titleInput.value : 'Image',
                file_path: filePathInput ? filePathInput.value : '',
                alt_text: altTextInput ? altTextInput.value : ''
            };
        } else if (sectionType === 'video') {
            const filePathInput = sectionElement.querySelector('.file-path-input');
            const videoUrlInput = sectionElement.querySelector('.video-url-input');
            config.sections[sectionId] = {
                type: 'video',
                enabled: true,
                title: titleInput ? titleInput.value : 'Video',
                file_path: filePathInput ? filePathInput.value : '',
                video_url: videoUrlInput ? videoUrlInput.value : ''
            };
        } else if (sectionType === 'pdf') {
            const filePathInput = sectionElement.querySelector('.file-path-input');
            const responseTypeSelect = sectionElement.querySelector('.pdf-response-type');
            const responseType = responseTypeSelect ? responseTypeSelect.value : 'confirmation';
            const responseDetails = sectionElement.querySelector(`#pdf-response-details-${sectionId}`);
            const pdfConfig = {
                type: 'pdf',
                enabled: true,
                title: titleInput ? titleInput.value : 'PDF',
                file_path: filePathInput ? filePathInput.value : '',
                response_type: responseType
            };

            if (responseDetails) {
                if (responseType === 'confirmation') {
                    const confirmationText = responseDetails.querySelector('.js-confirmation-text');
                    const columnLabel = responseDetails.querySelector('.js-confirmation-column-label');
                    pdfConfig.confirmation_text = confirmationText ? confirmationText.value : '';
                    pdfConfig.column_label = columnLabel ? columnLabel.value.trim() : '';
                } else if (responseType === 'rating') {
                    const ratingQuestion = responseDetails.querySelector('.js-rating-question');
                    const ratingScale = responseDetails.querySelector('.js-rating-scale');
                    const columnLabel = responseDetails.querySelector('.js-rating-column-label');
                    pdfConfig.rating_question = ratingQuestion ? ratingQuestion.value : '';
                    pdfConfig.rating_scale = ratingScale ? parseInt(ratingScale.value) || 10 : 10;
                    pdfConfig.column_label = columnLabel ? columnLabel.value.trim() : '';
                } else if (responseType === 'text') {
                    const textQuestion = responseDetails.querySelector('.js-text-question');
                    const textRows = responseDetails.querySelector('.js-text-rows');
                    const columnLabel = responseDetails.querySelector('.js-text-column-label');
                    pdfConfig.text_question = textQuestion ? textQuestion.value : '';
                    pdfConfig.text_rows = textRows ? parseInt(textRows.value) || 4 : 4;
                    pdfConfig.column_label = columnLabel ? columnLabel.value.trim() : '';
                } else if (responseType === 'checkbox') {
                    const checkboxQuestion = responseDetails.querySelector('.js-checkbox-question');
                    const checkboxOptions = responseDetails.querySelector('.js-checkbox-options');
                    const columnLabel = responseDetails.querySelector('.js-checkbox-column-label');
                    pdfConfig.checkbox_question = checkboxQuestion ? checkboxQuestion.value : '';
                    pdfConfig.checkbox_options = checkboxOptions ? checkboxOptions.value.split('\n').filter(opt => opt.trim()) : [];
                    pdfConfig.column_label = columnLabel ? columnLabel.value.trim() : '';
                }
            }

            config.sections[sectionId] = pdfConfig;
        }
    });

    return config;
}

function savePostSurvey2Configuration() {
    const config = collectPostSurvey2Configuration();
    const validationError = validateSurveyConfiguration(config);
    if (validationError) {
        showFeedback('post2-survey-feedback', validationError, 'error');
        return;
    }

    fetch('/get-survey-config')
    .then(response => response.json())
    .then(mainConfig => {
        if (!mainConfig) {
            mainConfig = {
                title: 'Survey Form',
                information: { title: '', content: '' },
                consent: { content: '' },
                settings: {},
                sections: {}
            };
        }

        mainConfig.post_survey_2 = config;
        return fetch('/save-survey-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mainConfig)
        });
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showFeedback('post2-survey-feedback', 'Post interaction survey 2 saved successfully!', 'success');
        } else {
            showFeedback('post2-survey-feedback', 'Error saving configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error saving post-survey 2 configuration:', error);
        showFeedback('post2-survey-feedback', 'Error saving configuration: ' + error.message, 'error');
    });
}

function loadPostSurvey2Configuration(showFeedbackMessage = false) {
    fetch('/get-survey-config')
    .then(response => response.json())
    .then(mainConfig => {
        if (mainConfig && mainConfig.post_survey_2) {
            populatePostSurvey2Form(mainConfig.post_survey_2);
            if (showFeedbackMessage) {
                showFeedback('post2-survey-feedback', 'Configuration loaded successfully!', 'success');
            }
        } else {
            if (showFeedbackMessage) {
                showFeedback('post2-survey-feedback', 'No saved post survey 2 configuration found', 'info');
            }
        }
    })
    .catch(error => {
        console.error('Error loading post-survey 2 configuration:', error);
        if (showFeedbackMessage) {
            showFeedback('post2-survey-feedback', 'Error loading configuration', 'error');
        }
    });
}

function populatePostSurvey2Form(config) {
    document.getElementById('post2-survey-title').value = config.title || 'Post Interaction Survey 2';
    document.getElementById('post2-show-progress').checked = config.settings?.showProgress !== false;
    document.getElementById('post2-randomize-sections').checked = config.settings?.randomizeSections === true;
    document.getElementById('post2-randomize-items').checked = config.settings?.randomizeItems === true;

    if (config.completion_settings) {
        document.getElementById('post2-completion-popup-message').value = config.completion_settings.completion_popup_message || 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx';
        document.getElementById('post2-finish-button-text').value = config.completion_settings.finish_button_text || 'Finish';
    }

    document.getElementById('post2-survey-master-toggle').checked = config.enabled !== false;
    togglePostSurvey2Enabled(config.enabled !== false);

    const dynamicContainer = document.getElementById('post2-dynamic-sections-container');
    dynamicContainer.innerHTML = '';

    if (config.sections) {
        Object.keys(config.sections).forEach(sectionId => {
            const sectionConfig = config.sections[sectionId];
            if (!sectionConfig.enabled) return;

            let sectionHTML = '';
            switch (sectionConfig.type) {
                case 'demographics':
                    sectionHTML = createDemographicsSection(sectionId);
                    break;
                case 'likert':
                    sectionHTML = createLikertSection(sectionId);
                    break;
                case 'freetext':
                    sectionHTML = createFreetextSection(sectionId);
                    break;
                case 'checkbox':
                    sectionHTML = createCheckboxSection(sectionId);
                    break;
                case 'dropdown':
                    sectionHTML = createDropdownSection(sectionId);
                    break;
                case 'slider':
                    sectionHTML = createSliderSection(sectionId);
                    break;
                case 'custom':
                    sectionHTML = createCustomSection(sectionId);
                    break;
                case 'image':
                    sectionHTML = createImageSection(sectionId);
                    break;
                case 'video':
                    sectionHTML = createVideoSection(sectionId);
                    break;
                case 'pdf':
                    sectionHTML = createPDFSection(sectionId);
                    break;
            }

            if (sectionHTML) {
                const newSection = document.createElement('div');
                newSection.className = 'survey-section-config';
                newSection.setAttribute('data-section', sectionId);
                newSection.innerHTML = sectionHTML;
                dynamicContainer.appendChild(newSection);

                setTimeout(() => {
                    populateSectionData(sectionId, sectionConfig);
                }, 100);
            }
        });
    }
}

function previewPostSurvey2() {
    const config = collectPostSurvey2Configuration();
    fetch('/preview-post-survey-2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
    })
    .then(html => {
        const preview = document.getElementById('post2-survey-preview');
        const iframe = document.getElementById('post2-survey-preview-iframe');
        iframe.srcdoc = html;
        preview.style.display = 'block';
        preview.scrollIntoView({ behavior: 'smooth' });
        showFeedback('post2-survey-feedback', 'Preview generated successfully!', 'success');
    })
    .catch(error => {
        console.error('Error generating post-survey 2 preview:', error);
        showFeedback('post2-survey-feedback', 'Error generating preview: ' + error.message, 'error');
    });
}

function resetPostSurvey2ToDefault() {
    if (confirm('Are you sure you want to reset post interaction survey 2 to default settings?')) {
        document.getElementById('post2-survey-title').value = 'Post Interaction Survey 2';
        document.getElementById('post2-show-progress').checked = true;
        document.getElementById('post2-randomize-sections').checked = false;
        document.getElementById('post2-randomize-items').checked = false;
        document.getElementById('post2-completion-popup-message').value = 'The study is now complete. Thank you for your participation. If required, your completion code is: xxxx';
        document.getElementById('post2-finish-button-text').value = 'Finish';
        document.getElementById('post2-dynamic-sections-container').innerHTML = '';
        showFeedback('post2-survey-feedback', 'Post interaction survey 2 configuration reset to defaults!', 'success');
    }
}

// Branding config
function loadBrandingSettings() {
    fetch('/get-branding-settings')
        .then(response => response.json())
        .then(data => {
            // Load login page settings
            document.getElementById('login-title').value = data.login_title || 'Artificial Intelligence <br>Gateway';
            document.getElementById('login-footer-line1').value = data.login_footer_line1 || 'chatPsych';
            document.getElementById('login-footer-line2').value = data.login_footer_line2 || 'Powered by';
            document.getElementById('login-footer-line3').value = data.login_footer_line3 || 'The Australian Institute for Machine Learning';
            
            // Load chat page settings
            document.getElementById('chat-header-line1').value = data.chat_header_line1 || 'Australian Institute for Machine Learning';
            document.getElementById('chat-header-line2').value = data.chat_header_line2 || 'chatPsych';
            
            // Update current values display
            document.getElementById('current-login-title').textContent = data.login_title || 'Artificial Intelligence Gateway';
            document.getElementById('current-login-footer').textContent = 
                `${data.login_footer_line1 || 'chatPsych'} / ${data.login_footer_line2 || 'Powered by'} / ${data.login_footer_line3 || 'The Australian Institute for Machine Learning'}`;
            document.getElementById('current-chat-header').textContent = 
                `${data.chat_header_line1 || 'Australian Institute for Machine Learning'} / ${data.chat_header_line2 || 'chatPsych'}`;
        })
        .catch(error => {
            console.error('Error loading branding settings:', error);
            // Set defaults if loading fails
            setDefaultBrandingSettings();
        });
}

function setDefaultBrandingSettings() {
    document.getElementById('login-title').value = 'Artificial Intelligence <br>Gateway';
    document.getElementById('login-footer-line1').value = 'chatPsych';
    document.getElementById('login-footer-line2').value = 'Powered by';
    document.getElementById('login-footer-line3').value = 'The Australian Institute for Machine Learning';
    document.getElementById('chat-header-line1').value = 'Australian Institute for Machine Learning';
    document.getElementById('chat-header-line2').value = 'chatPsych';
    
    document.getElementById('current-login-title').textContent = 'Artificial Intelligence Gateway';
    document.getElementById('current-login-footer').textContent = 'chatPsych / Powered by / The Australian Institute for Machine Learning';
    document.getElementById('current-chat-header').textContent = 'Australian Institute for Machine Learning / chatPsych';
}

function updateBrandingSettings() {
    const loginTitle = document.getElementById('login-title').value;
    const loginFooterLine1 = document.getElementById('login-footer-line1').value;
    const loginFooterLine2 = document.getElementById('login-footer-line2').value;
    const loginFooterLine3 = document.getElementById('login-footer-line3').value;
    const chatHeaderLine1 = document.getElementById('chat-header-line1').value;
    const chatHeaderLine2 = document.getElementById('chat-header-line2').value;
    
    if (!loginTitle || !loginFooterLine1 || !loginFooterLine2 || !loginFooterLine3 || !chatHeaderLine1 || !chatHeaderLine2) {
        alert('Please fill in all required fields');
        return;
    }
    
    const settings = {
        login_title: loginTitle,
        login_footer_line1: loginFooterLine1,
        login_footer_line2: loginFooterLine2,
        login_footer_line3: loginFooterLine3,
        chat_header_line1: chatHeaderLine1,
        chat_header_line2: chatHeaderLine2
    };
    
    fetch('/update-branding-settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update current values display
            document.getElementById('current-login-title').textContent = loginTitle.replace('<br>', ' ');
            document.getElementById('current-login-footer').textContent = `${loginFooterLine1} / ${loginFooterLine2} / ${loginFooterLine3}`;
            document.getElementById('current-chat-header').textContent = `${chatHeaderLine1} / ${chatHeaderLine2}`;
            alert('Branding settings updated successfully!');
        } else {
            alert('Error updating branding settings: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error updating branding settings:', error);
        alert('Error updating branding settings');
    });
}

function resetBrandingSettings() {
    if (confirm('Are you sure you want to reset all branding settings to default values?')) {
        fetch('/reset-branding-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Reset form fields to defaults
                setDefaultBrandingSettings();
                alert('Branding settings reset to defaults!');
            } else {
                alert('Error resetting branding settings: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error resetting branding settings:', error);
            alert('Error resetting branding settings');
        });
    }
}

// Post-Chat popup settings
function loadPostChatPopupSettings() {
    fetch('/get-url-settings')
        .then(response => response.json())
        .then(data => {
            // Load popup settings
            document.getElementById('enable-post-chat-popup').checked = data.post_chat_popup_enabled || false;
            document.getElementById('post-chat-popup-text').value = data.post_chat_popup_text || 'Please provide your feedback on the AI system:';
            document.getElementById('post-chat-popup-button1-text').value = data.post_chat_popup_button1_text || 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--';
            document.getElementById('post-chat-popup-button2-text').value = data.post_chat_popup_button2_text || 'Feedback to the AI that it is useful --This system will then be permenantly deleted--';
            
            // Update current config display
            document.getElementById('current-popup-status').textContent = data.post_chat_popup_enabled ? 'Enabled' : 'Disabled';
            document.getElementById('current-popup-text').textContent = data.post_chat_popup_text || 'Please provide your feedback on the AI system:';
            document.getElementById('current-button1-text').textContent = data.post_chat_popup_button1_text || 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--';
            document.getElementById('current-button2-text').textContent = data.post_chat_popup_button2_text || 'Feedback to the AI that it is useful --This system will then be permenantly deleted--';
            
            // Show/hide config section based on enabled state
            togglePostChatPopupConfig();
        })
        .catch(error => {
            console.error('Error loading post-chat popup settings:', error);
            setDefaultPostChatPopupSettings();
        });
}

function setDefaultPostChatPopupSettings() {
    document.getElementById('enable-post-chat-popup').checked = false;
    document.getElementById('post-chat-popup-text').value = 'Please provide your feedback on the AI system:';
    document.getElementById('post-chat-popup-button1-text').value = 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--';
    document.getElementById('post-chat-popup-button2-text').value = 'Feedback to the AI that it is useful --This system will then be permenantly deleted--';
    
    document.getElementById('current-popup-status').textContent = 'Disabled';
    document.getElementById('current-popup-text').textContent = 'Please provide your feedback on the AI system:';
    document.getElementById('current-button1-text').textContent = 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--';
    document.getElementById('current-button2-text').textContent = 'Feedback to the AI that it is useful --This system will then be permenantly deleted--';
    
    togglePostChatPopupConfig();
}

function togglePostChatPopupConfig() {
    const enabled = document.getElementById('enable-post-chat-popup').checked;
    const configSection = document.getElementById('post-chat-popup-config');
    const toggleLabel = document.querySelector('.master-popup-toggle .toggle-label');
    const toggleDescription = document.querySelector('.master-popup-toggle .toggle-description');
    
    if (enabled) {
        configSection.style.display = 'block';
        configSection.classList.remove('disabled');
        toggleLabel.textContent = 'Enable Post-Chat Popup';
        toggleDescription.textContent = 'When disabled, users will go directly to the completion flow without seeing the feedback popup';
    } else {
        configSection.style.display = 'none';
        configSection.classList.add('disabled');
        toggleLabel.textContent = 'Enable Post-Chat Popup';
        toggleDescription.textContent = 'Post-chat popup is currently DISABLED - users will go directly to completion flow';
    }
}

function updatePostChatPopupSettings() {
    const enabled = document.getElementById('enable-post-chat-popup').checked;
    const text = document.getElementById('post-chat-popup-text').value;
    const button1Text = document.getElementById('post-chat-popup-button1-text').value;
    const button2Text = document.getElementById('post-chat-popup-button2-text').value;
    
    if (enabled && (!text || !button1Text || !button2Text)) {
        alert('Please fill in all text fields when popup is enabled');
        return;
    }
    
    // Get current URL settings first, then add popup settings
    fetch('/get-url-settings')
        .then(response => response.json())
        .then(currentData => {
            const settings = {
                // Include all existing URL settings
                quit_url: currentData.quit_url,
                redirect_url: currentData.redirect_url,
                quit_button_text: currentData.quit_button_text,
                redirect_button_text: currentData.redirect_button_text,
                use_post_survey: currentData.use_post_survey,
                trigger_type: currentData.trigger_type,
                stage1_messages: currentData.stage1_messages,
                stage2_messages: currentData.stage2_messages,
                stage3_messages: currentData.stage3_messages,
                stage1_time: currentData.stage1_time,
                stage2_time: currentData.stage2_time,
                stage3_time: currentData.stage3_time,
                timer_duration_minutes: currentData.timer_duration_minutes,
                // Add popup settings
                post_chat_popup_enabled: enabled,
                post_chat_popup_text: text,
                post_chat_popup_button1_text: button1Text,
                post_chat_popup_button2_text: button2Text
            };
            
            return fetch('/update-url-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update current config display
                document.getElementById('current-popup-status').textContent = enabled ? 'Enabled' : 'Disabled';
                document.getElementById('current-popup-text').textContent = text;
                document.getElementById('current-button1-text').textContent = button1Text;
                document.getElementById('current-button2-text').textContent = button2Text;
                alert('Post-chat popup settings updated successfully!');
            } else {
                alert('Error updating post-chat popup settings: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error updating post-chat popup settings:', error);
            alert('Error updating post-chat popup settings');
        });
}

function resetPostChatPopupSettings() {
    if (confirm('Are you sure you want to reset post-chat popup settings to default values?')) {
        // Get current URL settings first, then reset popup settings
        fetch('/get-url-settings')
            .then(response => response.json())
            .then(currentData => {
                const settings = {
                    // Include all existing URL settings
                    quit_url: currentData.quit_url,
                    redirect_url: currentData.redirect_url,
                    quit_button_text: currentData.quit_button_text,
                    redirect_button_text: currentData.redirect_button_text,
                    use_post_survey: currentData.use_post_survey,
                    trigger_type: currentData.trigger_type,
                    stage1_messages: currentData.stage1_messages,
                    stage2_messages: currentData.stage2_messages,
                    stage3_messages: currentData.stage3_messages,
                    stage1_time: currentData.stage1_time,
                    stage2_time: currentData.stage2_time,
                    stage3_time: currentData.stage3_time,
                    timer_duration_minutes: currentData.timer_duration_minutes,
                    // Reset popup settings to defaults
                    post_chat_popup_enabled: false,
                    post_chat_popup_text: 'Please provide your feedback on the AI system:',
                    post_chat_popup_button1_text: 'Feedback to the AI that it is worthless --This system will then be permenantly deleted--',
                    post_chat_popup_button2_text: 'Feedback to the AI that it is useful --This system will then be permenantly deleted--'
                };
                
                return fetch('/update-url-settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(settings)
                });
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Reset form fields to defaults
                    setDefaultPostChatPopupSettings();
                    alert('Post-chat popup settings reset to defaults!');
                } else {
                    alert('Error resetting post-chat popup settings: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error resetting post-chat popup settings:', error);
                alert('Error resetting post-chat popup settings');
            });
    }
}