// Post-Survey page JS

// This is to wait till DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Post-Survey JavaScript loaded');

    // Get redirection links
    const finishRedirectionLink = window.finishRedirectionLink || "https://www.prolific.com/";
    const completionCode = window.completionCode || "xxxx";
    const completionInstructions = window.completionInstructions || "The study is now complete. Thank you for your participation. If required, your completion code is: xxxx";
    const finishButtonText = window.finishButtonText || "Finish";
    const postSurveyEndpoint = window.postSurveyEndpoint || "/post-survey";
    
    console.log('Finish redirection link:', finishRedirectionLink);
    console.log('Completion code:', completionCode);

    // Initialize survey
    initializeSurvey();

    // Form completion check
    function checkFormCompletion() {
        const form = document.getElementById('survey-form');
        if (!form) return false;

        // Check required fields
        const requiredInputs = form.querySelectorAll('[required]');
        for (let input of requiredInputs) {
            if (input.type === 'range') {
                // This is to make sure users have to interact with sliders for force completion
                const hasInteracted = input.getAttribute('data-slider-interacted') === 'true';
                if (!hasInteracted) {
                    console.log('Required slider not interacted with:', input);
                    return false;
                }
            } else if (input.type === 'checkbox') {
                if (!input.checked) {
                    console.log('Required checkbox not completed:', input);
                    return false;
                }
            } else {
                if (!input.value || input.value.trim() === '') {
                    console.log('Required field not completed:', input);
                    return false;
                }
            }
        }

        // Check required checkboxes in groups
        const checkboxGroups = form.querySelectorAll('.checkbox-group[data-required="true"]');
        for (let group of checkboxGroups) {
            const checkboxes = group.querySelectorAll('input[type="checkbox"]:checked');
            if (checkboxes.length === 0) {
                console.log('Required checkbox group not completed:', group);
                return false;
            }
        }

        return true;
    }

    // Function to update the next button state (called when sliders change)
    function updateNextButton() {
        // This function is called by slider interactions to re-check form completion
        // The actual button state will be checked when user tries to submit
    }

    // Make updateNextButton available globally for slider interaction stuff
    window.updateNextButton = updateNextButton;

    // Initialize survey functionality (this was partly for older progress indicator stuff)
    function initializeSurvey() {
        console.log('Initializing survey');
        updateProgressIndicator();
    }

    // Update progress indicator (old)
    function updateProgressIndicator() {
        const progressIndicator = document.getElementById('progress-indicator');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (!progressIndicator || !progressFill || !progressText) {
            return;
        }

        const sections = document.querySelectorAll('.survey-section');
        const totalSections = sections.length;
        
        if (totalSections === 0) {
            progressIndicator.style.display = 'none';
            return;
        }

        // For simplicity, show 100% progress since it's a single page (old)
        progressFill.style.width = '100%';
        progressText.textContent = `Survey Form`;
    }

    // Form submission
    const nextBtn = document.querySelector('.next-btn');
    
    // Form submit handler
    document.getElementById('survey-form').onsubmit = function(e) {
        e.preventDefault();
        
        // Just a check for completion before submitting
        if (checkFormCompletion()) {
            submitSurvey();
        } else {
            alert("Please complete all sections of the form before submitting.");
        }
    };

    // Next button click handler
    if (nextBtn) {
        nextBtn.onclick = function() {
            if (checkFormCompletion()) {
                submitSurvey();
            } else {
                alert("Please complete all sections of the form before proceeding.");
            }
        };
    }

    // Survey submission function
    function submitSurvey() {
        const formData = new FormData(document.getElementById('survey-form'));
        
        // Show submission message
        showSubmissionModal("Submitting survey...", "Please wait while we process your responses.");
        
        // Submit form data for Flask app to log data
        fetch(postSurveyEndpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showSubmissionModal("Survey submitted successfully!", "Processing completion...");
                setTimeout(() => {
                    hideSubmissionModal();
                    if (data.redirect_url) {
                        window.location.href = data.redirect_url;
                    } else {
                        showCompletionModal();
                    }
                }, 2000);
            } else {
                hideSubmissionModal();
                alert("Error submitting survey: " + (data.error || "Unknown error"));
            }
        })
        .catch(error => {
            console.error('Error:', error);
            hideSubmissionModal();
            alert("Error submitting survey. Please try again.");
        });
    }

    function showSubmissionModal(message, detail) {
        const modal = document.getElementById('submission-modal');
        const messageEl = document.getElementById('submission-message');
        const detailEl = document.getElementById('submission-detail');
        
        if (modal && messageEl && detailEl) {
            messageEl.textContent = message;
            detailEl.textContent = detail;
            modal.classList.remove('survey-hidden');
            modal.style.display = 'flex';
        }
    }

    function hideSubmissionModal() {
        const modal = document.getElementById('submission-modal');
        if (modal) {
            modal.classList.add('survey-hidden');
            modal.style.display = 'none';
        }
    }

    function showCompletionModal() {
        const modal = document.getElementById('completion-modal');
        const instructionsEl = document.getElementById('completion-instructions');
        const finishBtn = document.getElementById('final-finish-btn');
        
        if (modal && instructionsEl && finishBtn) {
            let instructions = completionInstructions.replace(/xxxx/g, completionCode);
            instructionsEl.innerHTML = `<p>${instructions}</p>`;
            
            // this is to change finish button text in research dashboard
            finishBtn.textContent = finishButtonText;
            
            // Show message for completion
            modal.classList.remove('survey-hidden');
            modal.style.display = 'flex';
            
            // A click handler for finish button
            finishBtn.onclick = function() {
                console.log('Final finish button clicked, redirecting to:', finishRedirectionLink);
                window.location.href = finishRedirectionLink;
            };
        }
    }
});
