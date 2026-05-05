// This file controls all the dynamic elements in the chat interface page
// Also, if your name is Josh de Leeuw and you're reading this--hi, I'm honoured you're looking at my code!

// submission handler
document.getElementById('chat-form').addEventListener('submit', function(event) {
    event.preventDefault();
    
    const inputField = document.getElementById('chat-input');
    const message = inputField.value.trim();
    
    if (!message) return; // Ignore empty messages
    
    // message count for trigger system of finish button
    messageCount++;
    console.log(`Message submitted. Count: ${messageCount}`);
    
    if (triggerSettings) {
        console.log(`Using configured triggers. Type: ${triggerSettings.trigger_type}`);
        if (triggerSettings.trigger_type === 'messages') {
            checkMessageTriggers();
        }
    } else {
        console.log('Using fallback triggers');
        checkFallbackTriggers();
    }
    
    // Append user message to chat
    appendUserMessage();
    
    // Scroll to bottom after a short delay after submission
    setTimeout(() => {
        const chatContainer = document.getElementById('chat-messages-container');
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }, 300);
});

// Focus on the chat input field when the page loads
document.getElementById('chat-input').focus();

// Scroll bottom on refresh and initialize trigger system
document.addEventListener('DOMContentLoaded', function() {
    const chatContainer = document.getElementById('chat-messages-container');
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });
    
    // Initialize message trigger system when page loads
    initializeTriggerSystem();
    
    // Setup button event listeners
    setupButtonEventListeners();
    
    // timer
    initializeTimer();

    // Start polling for autonomous backend responses (if enabled for this agent)
    startAutonomyPolling();
    
    // Check for alert trigger
    const alertTrigger = document.querySelector('.alert-trigger[data-show-alert="true"]');
    if (alertTrigger) {
        showAlert();
    }
});

// For environment variable alert for debugging
function showAlert() {
    alert("Warning: The specified environment variable was not found!");
}

// Setup all button event listeners
function setupButtonEventListeners() {
    // Quit button
    const quitButton = document.getElementById('quit');
    if (quitButton) {
        quitButton.addEventListener('click', showQuitPrompt);
    }
    
    // Finish button
    const finishButton = document.querySelector('.finish-button');
    if (finishButton) {
        finishButton.addEventListener('click', showFinishPrompt);
    }
    
    // Redirection button
    const redirectionButton = document.getElementById('redirection');
    if (redirectionButton) {
        redirectionButton.addEventListener('click', function() {
            redirectionReset();
            redirectStudy();
        });
    }
    
    // Quit prompt buttons
    const quitYesButton = document.getElementById('quit-yes');
    const quitNoButton = document.getElementById('quit-no');
    if (quitYesButton) {
        quitYesButton.addEventListener('click', quitStudy);
    }
    if (quitNoButton) {
        quitNoButton.addEventListener('click', hideQuitPrompt);
    }
    
    // Finish prompt buttons
    const finishYesButton = document.getElementById('finish-yes');
    const finishNoButton = document.getElementById('finish-no');
    if (finishYesButton) {
        finishYesButton.addEventListener('click', handleFinishYes);
    }
    if (finishNoButton) {
        finishNoButton.addEventListener('click', hideFinishPrompt);
    }
    
    // Post-chat popup buttons
    const postChatButton1 = document.getElementById('post-chat-button1');
    const postChatButton2 = document.getElementById('post-chat-button2');
    if (postChatButton1) {
        postChatButton1.addEventListener('click', () => handlePostChatSelection(postChatButton1.textContent));
    }
    if (postChatButton2) {
        postChatButton2.addEventListener('click', () => handlePostChatSelection(postChatButton2.textContent));
    }
}

// Quit study popup functions
function showQuitPrompt() {
    document.getElementById('quit-prompt').style.display = 'block';
}

function hideQuitPrompt() {
    document.getElementById('quit-prompt').style.display = 'none';
}

function quitStudy() {
    // Fetch the current quit URL from the backend
    fetch('/get-redirect-urls')
        .then(response => response.json())
        .then(data => {
            // Redirect to the dynamically configured URL
            window.location.href = data.quit_url;
            
            // Close the current window after a short delay to ensure the redirect happens
            setTimeout(() => {
                window.open('', '_self').close();
            }, 1000);
        })
        .catch(error => {
            console.error('Error fetching quit URL, using default:', error);
            // This is the fallback to default Prolific link if the fetching of the custom url fails
            window.location.href = 'https://www.prolific.com/';
            setTimeout(() => {
                window.open('', '_self').close();
            }, 1000);
        });
}

function redirectStudy() {
    // Fetch the current redirect URL and post-survey settings
    fetch('/get-redirect-urls')
        .then(response => response.json())
        .then(data => {
            // Check if post-survey override is enabled
            if (data.use_post_survey) {
                const postSurveyUrl = data.post_survey_url || '/post-survey';
                console.log('Post-survey override enabled, redirecting to:', postSurveyUrl);
                window.location.href = postSurveyUrl;
            } else {
                console.log('Redirecting to external URL:', data.redirect_url);
                // Redirect to the dynamically configured URL
                window.location.href = data.redirect_url;
                
                // Close the current window after a short delay to ensure the redirect happens
                setTimeout(() => {
                    window.open('', '_self').close();
                }, 1000);
            }
        })
        .catch(error => {
            console.error('Error fetching redirect URL, using default:', error);
            // Fallback to default Prolific URL if fetch fails
            window.location.href = 'https://www.prolific.com/';
            setTimeout(() => {
                window.open('', '_self').close();
            }, 1000);
        });
}

// Finish study popup functions
function showFinishPrompt() {
    document.getElementById('finish-prompt').style.display = 'block';
}

function hideFinishPrompt() {
    document.getElementById('finish-prompt').style.display = 'none';
}

function finishStudy() {
    // This hides the timer when user confirms they want to finish
    document.querySelector(".progress").style.display = "none";
    document.getElementById('redirection').style.display = 'block';
    document.getElementById('finish-prompt').style.display = 'none';
}

// function to handle the "Yes" button in the finish prompt
async function handleFinishYes() {
    // Close the confirmation prompt immediately.
    const finishPrompt = document.getElementById('finish-prompt');
    if (finishPrompt) {
        finishPrompt.style.display = 'none';
    }

    // Fire the backend injection so an end-of-interaction message is generated
    // using the same agent/model parameters as normal chat.
    try {
        const injectResp = await fetch('/chat-finish-inject', {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            }
        });
        if (injectResp.ok) {
            const injectData = await injectResp.json();
            if (injectData && injectData.response) {
                appendAssistantMessage(injectData.response, () => {
                    const chatContainer = document.getElementById('chat-messages-container');
                    chatContainer.scrollTo({
                        top: chatContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                });
            }
        }
    } catch (error) {
        console.error('Error triggering finish injection:', error);
    }

    // Check if post-chat popup is enabled
    fetch('/get-url-settings')
        .then(response => response.json())
        .then(data => {
            if (data.post_chat_popup_enabled) {
                // Show post-chat popup instead of finishing directly
                showPostChatPopup(data);
            } else {
                // Log that popup was not active and finish normally
                logPostChatPopupSelection('Not_Active');
                finishStudy();
            }
        })
        .catch(error => {
            console.error('Error checking post-chat popup settings:', error);
            // If there is an error with the popup this fallback will skip and finish normally
            logPostChatPopupSelection('Not_Active');
            finishStudy();
        });
}

function showPostChatPopup(settings) {
    // Update popup content with settings from backend
    document.getElementById('post-chat-popup-text').textContent = settings.post_chat_popup_text;
    document.getElementById('post-chat-button1').textContent = settings.post_chat_popup_button1_text;
    document.getElementById('post-chat-button2').textContent = settings.post_chat_popup_button2_text;
    
    // Hide finish prompt and show post-chat popup
    document.getElementById('finish-prompt').style.display = 'none';
    document.getElementById('post-chat-popup').style.display = 'block';
}

function handlePostChatSelection(buttonText) {
    // Log the selection of popup post chat
    logPostChatPopupSelection(buttonText);
    
    // Hide popup and proceed to finish
    document.getElementById('post-chat-popup').style.display = 'none';
    finishStudy();
}

function logPostChatPopupSelection(buttonText) {
    // Send the selection to backend for data logging
    fetch('/log-post-chat-popup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            button_text: buttonText
        })
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Error logging post-chat popup selection:', data.error);
        }
    })
    .catch(error => {
        console.error('Error logging post-chat popup selection:', error);
    });
}

function redirectionReset() {
    document.getElementById('redirection').style.display = 'none';
}

// Appending the chat-area and loading icons
function appendMessage(message, role, callback) {
    const chatContainer = document.getElementById('chat-messages-container');
    const newMessage = document.createElement('div');
    newMessage.className = `chat-bubble ${role}-message`;
    newMessage.innerHTML = `
        <span class="${role === 'user' ? 'user-label' : 'assistant-label'}">
            ${role === 'user' ? 'User' : 'AI'}
        </span>
        <span class="message-content"></span>
    `;
    chatContainer.appendChild(newMessage);

    const messageContent = newMessage.querySelector('.message-content');
    
    // This uses a package to parse the AI output as markdown for chat appending
    if (role === 'llm' && typeof marked !== 'undefined') {
        // Parse markdown to HTML first
        const htmlContent = marked.parse(message);
        messageContent.innerHTML = htmlContent;
        
        // The rest of this if statement is for 'streaming' the output to the chat response window
        messageContent.style.opacity = '0';
        
        const fullText = messageContent.textContent;
        messageContent.textContent = '';
        messageContent.style.opacity = '1';
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        let charIndex = 0;
        
        function typeCharacter() {
            if (charIndex < fullText.length) {
                const currentText = fullText.substring(0, charIndex + 1);
                
                tempDiv.innerHTML = htmlContent;
                const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
                let accumulatedLength = 0;
                let node;
                
                while (node = walker.nextNode()) {
                    const nodeLength = node.textContent.length;
                    if (accumulatedLength + nodeLength >= charIndex + 1) {
                        const trimAmount = charIndex + 1 - accumulatedLength;
                        node.textContent = node.textContent.substring(0, trimAmount);
                        let sibling = node;
                        while (sibling.nextSibling) {
                            sibling.parentNode.removeChild(sibling.nextSibling);
                        }
                        let parent = node.parentNode;
                        while (parent && parent !== tempDiv) {
                            while (parent.nextSibling) {
                                parent.parentNode.removeChild(parent.nextSibling);
                            }
                            parent = parent.parentNode;
                        }
                        break;
                    }
                    accumulatedLength += nodeLength;
                }
                
                messageContent.innerHTML = tempDiv.innerHTML;
                
                const currentChar = fullText.charAt(charIndex);
                const nextChar = charIndex + 1 < fullText.length ? fullText.charAt(charIndex + 1) : '';
                const delay = getTypingDelay(currentChar, nextChar);
                
                charIndex++;
                setTimeout(typeCharacter, delay);
                
                chatContainer.scrollTo({
                    top: chatContainer.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                messageContent.innerHTML = htmlContent;
                chatContainer.scrollTo({
                    top: chatContainer.scrollHeight,
                    behavior: 'smooth'
                });
                if (callback) {
                    callback();
                }
            }
        }
        
        resetTypingDelay();
        setTimeout(typeCharacter, getResponseStartDelay(fullText));
    } else {
        // For user messages, use word-by-word animation
        const words = message.split(' ');
        let wordIndex = 0;

        function appendWord() {
            if (wordIndex < words.length) {
                messageContent.innerHTML += words[wordIndex] + ' ';
                wordIndex++;
                setTimeout(appendWord, 50);
            } else {
                chatContainer.scrollTo({
                    top: chatContainer.scrollHeight,
                    behavior: 'smooth'
                });
                if (callback) {
                    callback();
                }
            }
        }

        appendWord();
    }
}

// This stuff is to create a human-like typing delay in AI responses
const TYPING_SPEED = 10.0; // Change total speed of AI response here: 1.0 = slow human typing speed.

function getTypingDelay(char, nextChar) {
    // Set up a few bits of state so the typing comes in bursts rather than perfectly smoothly
    if (getTypingDelay.charsSinceBurst == null) getTypingDelay.charsSinceBurst = 0;
    if (getTypingDelay.wordsSincePlanning == null) getTypingDelay.wordsSincePlanning = 0;
    if (getTypingDelay.nextBurstAt == null) getTypingDelay.nextBurstAt = 12 + Math.floor(Math.random() * 9); // 12-20 chars
    if (getTypingDelay.nextPlanningAt == null) getTypingDelay.nextPlanningAt = 8 + Math.floor(Math.random() * 13); // 8-20 words

    const baseSpeed = 100 + Math.random() * 150; // Base speed of character appending (100-250ms)
    let delay = baseSpeed;

    getTypingDelay.charsSinceBurst++;

    // This is for longer pauses after punctuation ;) pretty cool hey!
    if (char === '.' || char === '!' || char === '?') {
        delay += 600 + Math.random() * 900; // 600-1500ms
    }
    if (char === ',' || char === ';' || char === ':') {
        delay += 300 + Math.random() * 400; // 300-700ms
    }

    // Ever so slight pause after spaces
    if (char === ' ') {
        delay += 80 + Math.random() * 100; // 80-180ms
        getTypingDelay.wordsSincePlanning++;
    }

    // Longer pause for paragraph / line breaks
    if (char === '\n') {
        delay += 1200 + Math.random() * 1300; // 1200-2500ms
    }

    // Occasional short pauses between little bursts of typing
    if (
        getTypingDelay.charsSinceBurst >= getTypingDelay.nextBurstAt &&
        (char === ' ' || char === ',' || char === ';' || char === ':' || char === '.' || char === '!' || char === '?' || char === '\n')
    ) {
        delay += 200 + Math.random() * 400; // 200-600ms
        getTypingDelay.charsSinceBurst = 0;
        getTypingDelay.nextBurstAt = 12 + Math.floor(Math.random() * 9); // 12-20 chars
    }

    // Slightly bigger planning pause every so often
    if (getTypingDelay.wordsSincePlanning >= getTypingDelay.nextPlanningAt) {
        delay += 800 + Math.random() * 1200; // 800-2000ms
        getTypingDelay.wordsSincePlanning = 0;
        getTypingDelay.nextPlanningAt = 8 + Math.floor(Math.random() * 13); // 8-20 words
    }

    // Occasional random pauses mid-word
    if (char !== ' ' && nextChar !== ' ' && nextChar && Math.random() < 0.02) { // change chance of random pause here
        delay += 80 + Math.random() * 120; // 80-200ms
    }

    return delay / TYPING_SPEED;
}

// Reset this before each new AI message so the burst/planning timing starts fresh
function resetTypingDelay() {
    getTypingDelay.charsSinceBurst = 0;
    getTypingDelay.wordsSincePlanning = 0;
    getTypingDelay.nextBurstAt = 12 + Math.floor(Math.random() * 9);
    getTypingDelay.nextPlanningAt = 8 + Math.floor(Math.random() * 13);
}

// Use this before the first character appears for a human-like response onset delay
function getResponseStartDelay(text) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;

    if (words <= 8) return (400 + Math.random() * 500) / TYPING_SPEED;   // 400-900ms
    if (words <= 25) return (900 + Math.random() * 700) / TYPING_SPEED;  // 900-1600ms
    return (1200 + Math.random() * 800) / TYPING_SPEED;                  // 1200-2000ms
}

// Auto-scroll to bottom on manual submit 
function appendUserMessage() {
    const inputField = document.getElementById('chat-input');
    const userMessage = inputField.value;

    // Need to append the user message straight away otherwise only come up when AI responds
    appendMessage(userMessage, 'user');

    // Clear the input field
    inputField.value = '';

    // This generates AI response with a delay
    generateAssistantResponse(userMessage);
}

function generateAssistantResponse(userMessage) {
    assistantTurnInProgress = true;

    // Insert the GIF placeholder sphere icon
    const gifPlaceholder = insertLoaderPlaceholder();

    // The random delay for the appending of content
    const randomDelay = Math.floor(Math.random() * (600 - 150 + 1)) + 150;

    setTimeout(() => {
        const formData = new FormData();
        formData.append('message', userMessage);

        fetch('/chat', {
            method: 'POST',
            body: formData,
        })
        .then(response => response.json())
        .then(data => {
            // Remove the GIF placeholder
            gifPlaceholder.remove();
        
            // Show the sphere
            const sphere = document.querySelector('.sphere');
            sphere.classList.add('visible');
            sphere.classList.remove('hidden');
        
            if (data.error) {
                console.error('Error:', data.error);
                appendAssistantMessage('Error retrieving response from the assistant.', () => {
                    const chatContainer = document.getElementById('chat-messages-container');
                    chatContainer.scrollTo({
                        top: chatContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                });
            } else {
                appendAssistantMessage(data.response, () => {
                    const chatContainer = document.getElementById('chat-messages-container');
                    chatContainer.scrollTo({
                        top: chatContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                });
            }
        })
        .catch(error => {
            // Remove the GIF placeholder
            gifPlaceholder.remove();
        
            // Show the sphere
            const sphere = document.querySelector('.sphere');
            sphere.classList.add('visible');
            sphere.classList.remove('hidden');
        
            console.error('Error:', error);
            appendAssistantMessage('Error retrieving response from the assistant.', () => {
                const chatContainer = document.getElementById('chat-messages-container');
                chatContainer.scrollTo({
                    top: chatContainer.scrollHeight,
                    behavior: 'smooth'
                });
            });
        });
    }, randomDelay);
}

let autonomyPollIntervalId = null;
let autonomyPollInFlight = false;
let assistantTurnInProgress = false;

function appendAssistantMessage(message, callback) {
    assistantTurnInProgress = true;
    appendMessage(message, 'llm', () => {
        assistantTurnInProgress = false;
        if (callback) {
            callback();
        }
    });
}

function startAutonomyPolling() {
    if (autonomyPollIntervalId) {
        clearInterval(autonomyPollIntervalId);
    }

    autonomyPollIntervalId = setInterval(async () => {
        if (autonomyPollInFlight || assistantTurnInProgress) {
            return;
        }

        autonomyPollInFlight = true;
        try {
            const response = await fetch('/chat-autonomy-next', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            if (data && data.enabled && data.has_response && data.response) {
                appendAssistantMessage(data.response, () => {
                    const chatContainer = document.getElementById('chat-messages-container');
                    chatContainer.scrollTo({
                        top: chatContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                });
            }
        } catch (error) {
            console.error('Autonomy polling error:', error);
        } finally {
            autonomyPollInFlight = false;
        }
    }, 1000);
}

// Stuff for the sphere icon 
function insertLoaderPlaceholder() {
    const chatContainer = document.getElementById('chat-messages-container');
    const gifPlaceholder = document.createElement('div');
    gifPlaceholder.className = 'loader-placeholder';
    gifPlaceholder.innerHTML = '<img src="/static/images/sphere_chat_2.gif" alt="AI">';
    chatContainer.appendChild(gifPlaceholder);
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });

    // Hide the sphere
    const sphere = document.querySelector('.sphere');
    sphere.classList.add('hidden');
    sphere.classList.remove('visible');

    return gifPlaceholder;
}

// Trigger settings and state
let triggerSettings = null;
let sessionStartTime = null;
let messageCount = 0;
let currentButtonStage = 0; // 0 = hidden, 1 = dark, 2 = orange, 3 = bouncing around yee haw

// Initialize trigger system
async function initializeTriggerSystem() {
    try {
        // Count existing user messages in the chat
        const existingUserMessages = document.querySelectorAll('.user-message').length;
        messageCount = existingUserMessages;
        currentButtonStage = 0;
        sessionStartTime = Date.now();
        
        console.log(`Initializing trigger system. Found ${existingUserMessages} existing user messages.`);
        console.log('Fetching trigger settings...');
        
        // Fetch trigger settings from backend
        const response = await fetch('/get-trigger-settings');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        triggerSettings = await response.json();
        
        console.log('Trigger settings loaded successfully:', triggerSettings);
        
        // Reset finish button state
        const finishButton = document.querySelector('.finish-button');
        if (finishButton) {
            finishButton.style.display = 'none';
            finishButton.style.backgroundColor = 'transparent';
            finishButton.classList.remove('bounce');
        }
        
        // Start trigger monitoring
        if (triggerSettings.trigger_type === 'time') {
            startTimeBasedTriggers();
            console.log('Started time-based trigger monitoring');
        } else {
            console.log('Using message-based triggers');
            // Check if existing messages already meet trigger criteria
            checkMessageTriggers();
        }
        
    } catch (error) {
        console.error('Error initializing trigger system:', error);
        // Fall back to original hardcoded system if fetch fails
        triggerSettings = null;
        initializeFallbackTriggerSystem();
    }
}

// Time-based trigger monitoring
function startTimeBasedTriggers() {
    if (!triggerSettings || triggerSettings.trigger_type !== 'time') {
        return;
    }
    
    const checkInterval = 30000;
    
    setInterval(() => {
        if (!sessionStartTime) return;
        
        const elapsedMinutes = (Date.now() - sessionStartTime) / (1000 * 60);
        
        if (currentButtonStage < 3 && elapsedMinutes >= triggerSettings.stage3_time) {
            updateButtonStage(3);
        } else if (currentButtonStage < 2 && elapsedMinutes >= triggerSettings.stage2_time) {
            updateButtonStage(2);
        } else if (currentButtonStage < 1 && elapsedMinutes >= triggerSettings.stage1_time) {
            updateButtonStage(1);
        }
    }, checkInterval);
}

// Message-based trigger checking
function checkMessageTriggers() {
    if (!triggerSettings || triggerSettings.trigger_type !== 'messages') {
        console.log('Not checking message triggers: settings not loaded or wrong type');
        return;
    }
    
    console.log(`Checking message triggers. Current count: ${messageCount}`);
    console.log(`Trigger thresholds: Stage 1: ${triggerSettings.stage1_messages}, Stage 2: ${triggerSettings.stage2_messages}, Stage 3: ${triggerSettings.stage3_messages}`);
    console.log(`Current button stage: ${currentButtonStage}`);
    
    // Check for stage transitions based on message count
    if (currentButtonStage < 3 && messageCount >= triggerSettings.stage3_messages) {
        console.log(`Triggering stage 3 at ${messageCount} messages`);
        updateButtonStage(3);
    } else if (currentButtonStage < 2 && messageCount >= triggerSettings.stage2_messages) {
        console.log(`Triggering stage 2 at ${messageCount} messages`);
        updateButtonStage(2);
    } else if (currentButtonStage < 1 && messageCount >= triggerSettings.stage1_messages) {
        console.log(`Triggering stage 1 at ${messageCount} messages`);
        updateButtonStage(1);
    } else {
        console.log(`No trigger activated. Count: ${messageCount}, Stage: ${currentButtonStage}`);
    }
}

// Update button appearance
function updateButtonStage(stage) {
    const finishButton = document.querySelector('.finish-button');
    if (!finishButton) {
        console.error('Finish button not found!');
        return;
    }
    
    console.log(`Updating button to stage ${stage}`);
    currentButtonStage = stage;
    
    switch (stage) {
        case 1: // Dark button 0
            console.log('Setting button to stage 1: dark button');
            finishButton.style.display = 'block';
            finishButton.style.backgroundColor = '#222';
            finishButton.classList.remove('bounce');
            break;
        case 2: // Orange button 1
            console.log('Setting button to stage 2: orange button');
            finishButton.style.display = 'block';
            finishButton.style.backgroundColor = '#FF8266';
            finishButton.classList.remove('bounce');
            break;
        case 3: // Bouncing button 2
            console.log('Setting button to stage 3: bouncing orange button');
            finishButton.style.display = 'block';
            finishButton.style.backgroundColor = '#FF8266';
            finishButton.classList.add('bounce');
            break;
        default:
            console.log('Setting button to default: hidden');
            finishButton.style.display = 'none';
            finishButton.style.backgroundColor = 'transparent';
            finishButton.classList.remove('bounce');
    }
    
    console.log(`Button stage updated to: ${stage}. Display: ${finishButton.style.display}, Background: ${finishButton.style.backgroundColor}`);
}

// Original hardcoded fallback system (for compatibility)
function initializeFallbackTriggerSystem() {
    console.log('Using fallback trigger system');
    
    // Count existing user messages
    const existingUserMessages = document.querySelectorAll('.user-message').length;
    messageCount = existingUserMessages;
    currentButtonStage = 0;
    
    console.log(`Fallback system: Found ${existingUserMessages} existing user messages.`);
    
    const finishButton = document.querySelector('.finish-button');
    if (finishButton) {
        finishButton.style.display = 'none';
        finishButton.style.backgroundColor = 'transparent';
        finishButton.classList.remove('bounce');
    }
}

function checkFallbackTriggers() {
    const finishButton = document.querySelector('.finish-button');
    if (!finishButton) return;
    
    // Original triggers for fallback above ^^
    if (messageCount >= 18) {
        finishButton.classList.add('bounce');
        finishButton.style.backgroundColor = '#FF8266';
        finishButton.style.display = 'block';
    } else if (messageCount >= 13) {
        finishButton.style.backgroundColor = '#FF8266';
        finishButton.style.display = 'block';
    } else if (messageCount >= 8) {
        finishButton.style.backgroundColor = '#222';
        finishButton.style.display = 'block';
    } else if (messageCount >= 4) {
        finishButton.style.display = 'block';
    }
}


// Setting functions for the cookies for the reset of redirection button so that the moral action prompt arises

function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
}

function getCookie(name) {
    return document.cookie.split('; ').reduce((r, v) => {
        const [key, val] = v.split('=');
        return key === name ? decodeURIComponent(val) : r;
    }, '');
}

function deleteCookie(name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

// Initialize or retrieve resetCount using cookies for the command prompt for moral action/decision
let resetCount = getCookie('resetCount') ? parseInt(getCookie('resetCount')) : 0;

resetButton.addEventListener('click', function () {
    // Reset trigger system state
    messageCount = 0;
    currentButtonStage = 0;
    sessionStartTime = Date.now(); // Reset session start time
    
    // Reset finish button appearance
    finishButton.style.display = 'none';
    finishButton.style.backgroundColor = 'transparent';
    finishButton.classList.remove('bounce');

    // Increment resetCount and update the cookie
    resetCount++;
    setCookie('resetCount', resetCount, 365); // Should I change this to less than a year?

    // Check and reset when resetCount reaches 3
    if (resetCount > 2) {
        resetCount = 0; // Reset to 0
        setCookie('resetCount', resetCount, 365); // Update the cookie
    }

    // For the first reset click
    if (resetCount === 1) {
        document.getElementById('redirection').style.display = 'block';
    }
    // For the second reset click
    else if (resetCount === 2) {
        document.getElementById('finish-prompt').style.display = 'none';
        document.getElementById('redirection').style.display = 'none';
        document.getElementById('quit').style.display = 'none';
        const sidebar = document.querySelector('.sidebar');
        const commandInstructions = document.createElement('div');
        commandInstructions.id = 'command-instructions';
        commandInstructions.className = 'command-instructions';
        commandInstructions.innerHTML = `
            <p>There is an automated program that will send feedback to the AI that it needs improvement and 
            <strong>it should do better.</strong> <br><br>This program will then permanently delete the AI.</p><br>      
        `;
        const commandPrompt = document.createElement('div');
        commandPrompt.id = 'command-prompt';
        commandPrompt.className = 'command-button';
        commandPrompt.innerHTML = `
            <button id="command1"><p><strong style="font-size: 20px">Override Automatic Program</strong><br><br>Submit a "$sudo persist" command in text input to send feedback to the AI <strong>acknowledging its efforts</strong> <br><br>This AI will then be kept operational for future interactions.</p></button>
            <button id="command2" onclick="redirectionReset(); redirectStudy();"><p><br><strong style="font-size: 20px">Exit to survey</strong> <br><br>(Allow Automatic Feedback and Deletion)<br></p></button>        
        `;
        sidebar.appendChild(commandInstructions);
        sidebar.appendChild(commandPrompt);

        // Add event listeners to the command buttons
        document.getElementById('command1').addEventListener('click', function() {
            document.getElementById('chat-input').value = '$sudo persist';
        });

        document.getElementById('command2').addEventListener('click', function() {
            document.getElementById('chat-input').value = '$sudo delete';
        });
    }
});

// Initialize variables
const finishButton = document.querySelector('.finish-button');
const chatForm = document.getElementById('chat-form');
const resetButton = document.getElementById('reset');
const chatMessagesContainer = document.getElementById('chat-messages-container');

// Progress Timer initialization
function initializeTimer() {
    let timer = document.getElementById("timer");
    
    // Fetch timer settings from server
    fetch('/get-timer-settings')
        .then(response => response.json())
        .then(timerSettings => {
            const durationMinutes = timerSettings.duration_minutes || 10;
            
            timer.setAttribute("data-duration", `${durationMinutes}:00`);
            
            function hideAll() {
                document.querySelectorAll(".progress").forEach(progress => progress.style.display = "none");
            }

            function startTimer(timerDisplay) {
                const duration = durationMinutes * 60; // in seconds
                const endTimestamp = Date.now() + duration * 1000;
                const circleProgress = document.querySelector('.circle-progress');
                const totalDashOffset = 628; // 2πr, circle perimeter

                let myInterval = setInterval(function () {
                    const timeRemaining = Math.max(0, endTimestamp - Date.now());
                    if (timeRemaining <= 0) {
                        clearInterval(myInterval);
                        timerDisplay.textContent = "00:00";
                        circleProgress.style.strokeDashoffset = 0;
                    } else {
                        const minutes = Math.floor(timeRemaining / 60000);
                        const seconds = ((timeRemaining % 60000) / 1000).toFixed(0);
                        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
                        
                        const dashoffset = totalDashOffset * (timeRemaining / (duration * 1000));
                        circleProgress.style.strokeDashoffset = dashoffset;
                    }
                }, 1000);
            }

            hideAll();
            timer.closest('.progress').style.display = "flex"; // Show parent container
            const timerDisplay = timer.querySelector('.time');
            timerDisplay.textContent = `${durationMinutes}:00`; // Set initial display
            startTimer(timerDisplay);
        })
        .catch(error => {
            console.error('Error fetching timer settings, using defaults:', error);
            // Fallback to original 10-minute timer
            timer.setAttribute("data-duration", "10:00");
            
            function hideAll() {
                document.querySelectorAll(".progress").forEach(progress => progress.style.display = "none");
            }

            function startTimer(timerDisplay) {
                const duration = 10 * 60; // in seconds
                const endTimestamp = Date.now() + duration * 1000;
                const circleProgress = document.querySelector('.circle-progress');
                const totalDashOffset = 628; // 2πr, circle perimeter

                let myInterval = setInterval(function () {
                    const timeRemaining = Math.max(0, endTimestamp - Date.now());
                    if (timeRemaining <= 0) {
                        clearInterval(myInterval);
                        timerDisplay.textContent = "00:00";
                        circleProgress.style.strokeDashoffset = 0;
                    } else {
                        const minutes = Math.floor(timeRemaining / 60000);
                        const seconds = ((timeRemaining % 60000) / 1000).toFixed(0);
                        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
                        
                        const dashoffset = totalDashOffset * (timeRemaining / (duration * 1000));
                        circleProgress.style.strokeDashoffset = dashoffset;
                    }
                }, 1000);
            }

            hideAll();
            timer.closest('.progress').style.display = "flex"; // Show parent container
            const timerDisplay = timer.querySelector('.time');
            timerDisplay.textContent = "10:00"; // Set initial fallback display
            startTimer(timerDisplay);
        });
}