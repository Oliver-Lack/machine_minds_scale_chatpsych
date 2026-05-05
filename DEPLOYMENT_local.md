# How to Run chatPsych Locally

## Prerequisites

Ensure you have Python 3 installed:
```bash
python3 --version
```

## Python virtual environment setup

```bash
python3 -m venv venv
source venv/bin/activate
```

## Install Dependencies

Navigate to the chatPsych directory and install requirements:
```bash
cd whereEverYouPulledtheRepo/chatPsych
pip install -r requirements.txt
```

Running into errors? Make sure LiteLLM is latest version and Python is below V3.13.

## Setup Environment Variables

Create a `.env` file from the example:
```bash
cp .env.example .env
```
Edit the `.env` file with your actual values:

### Local Deployment:

```bash
gunicorn -w 4 -b 0.0.0.0:8000 chatPsych:app
```

## Login Information

- Deployment password list set in the chatPsych.py script
- Any username is accepted, but the password must match one of the deployment passwords.
- Default login password: 'chatPsych123'
- Default researcher user: 'admin' with password 'admin'
- Default randomised agent after more agents have been created: 'castle'
