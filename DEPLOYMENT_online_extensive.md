# Server Deployment Guide (chatPsych)

This method uses apache2, certbot, gunicorn, and Flask to deploy chatPsych as a web app Python environment.

## 0) Before you launch (Info only)
- Buy a domain. Point DNS to your server’s Elastic IP.
- Services for this deployment guide: AWS EC2, Ubuntu, Flask, Gunicorn, Apache2, Certbot.
- Note: you can deploy with any server running Ubuntu or similar Linux distro in the same way as described below.

## 1) Launch EC2 and SSH

Step 1: Launch an EC2 instance with Ubuntu 22.04 LTS.
- Choose an instance type (t3.medium good for 50ish participants concurrently).
- Configure security group to allow HTTP (80), HTTPS (443), and SSH (22) access.
- Download the key pair (e.g., `chatpsych.pem`) and set permissions:
From local computer directory holding the pem file run SSH terminal command:
For example: 
ssh -i "chatpsych.pem" ubuntu@ec2-52-64-0-79.ap-southeast-2.compute.amazonaws.com

## 2) Initial setup on the instance

While SSH into the EC2 instance — run:
sudo apt-get update
sudo apt-get install python3.venv
sudo mkdir /srv/chatpsych
sudo chown ubuntu:ubuntu /srv/chatpsych

## 3) Upload codebase to the server

Info only:
- From your local project folder, send files to /srv/chatpsych on the instance.

Local computer — run (pick one of examples below or make your own; edit paths/domains as needed):
Ex. rsync -avz -e "ssh -i /Users/a1809024/Desktop/PMC/AI_Interface/AWS/chatpsych.pem" ./* ubuntu@chatpsych-pilot.xyz:/srv/chatpsych/
Ex. rsync -avz --exclude="vent" --exclude="__pycache__" ../Chatpsych_1_0/ ubuntu@chatpsych.xyz:/srv/chatpsych/	
Ex. scp -i /Users/a1809024/Desktop/PMC/AI_Interface/AWS -r ./ ubuntu@chatpsych-pilot.xyz:/srv/chatpsych

Alternatively you could just clone chatPsych repository (or your own repository adaption) from GitHub using https: 
Ex. 
sudo apt install git-all
git clone https://github.com/Oliver-Lack/chatPsych.git

## 4) App environment and service

In EC2 instance — run:
cd /srv/chatpsych && ls -l
python3 -m venv venv
source venv/bin/activate
sudo apt install python3-pip
pip install Flask
pip install gunicorn
pip install -r requirements.txt
deactivate
sudo nano /etc/systemd/system/chatpsych.service

In EC2 instance — edit the now opened file (paste below, then Ctrl+O, Enter, Ctrl+X):
```nano
[Unit]
Description=Chatpsych Flask App
After=network.target

[Service]
User=chatpsych_user
Group=chatpsych_user
WorkingDirectory=/srv/chatpsych/
ExecStart=/srv/chatpsych/venv/bin/gunicorn chatpsych:app -w 4 -b 127.0.0.1:8000        
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then, in EC2 instance — run:
sudo systemctl daemon-reload
sudo systemctl enable --now chatpsych.service
sudo apt install apache2
cd /etc/apache2/sites-available/
sudo rm default-ssl.conf
sudo service apache2 start
sudo mv 000-default.conf chatpsych.xyz.conf
sudo nano chatpsych.xyz.conf

In EC2 instance — edit file that is now open (paste, then Ctrl+O, Enter, Ctrl+X):
```nano
<VirtualHost *:80>
        ServerName chatpsych.xyz
        ServerAlias www.chatpsych.xyz

        ProxyPass / http://127.0.0.1:8000/
        ProxyPassReverse / http://127.0.0.1:8000/
</VirtualHost>
```

Then, in EC2 instance — run:
sudo a2enmod proxy proxy_http
sudo a2dissite 000-default.conf
sudo a2ensite chatpsych.xyz.conf
sudo service chatpsych start
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --apache

Info only:
- In Certbot: set SSL for both domains by selecting 1, 2, Enter.

In EC2 instance — run:
sudo crontab -e

Info only:
- Choose nano “1”. Paste the line below to auto-renew. Save/exit.

EC2 instance — paste in crontab:
0 4 * * 1 /usr/bin/certbot --renew && /usr/sbin/service apache2 reload

In EC2 instance — run:
sudo adduser --system --no-create-home --group chatpsych_user
sudo nano /etc/systemd/system/chatpsych.service

Info only:
- Ensure [Service] has User=chatpsych_user and Group=chatpsych_user.

EC2 instance — run:
sudo chown -R chatpsych_user:chatpsych_user /srv/chatpsych/
sudo systemctl daemon-reload
sudo service chatpsych restart
sudo service chatpsych status

## 5) Environment variables

In EC2 instance — run:
cd /srv/chatpsych
source venv/bin/activate
sudo /srv/chatpsych/venv/bin/pip install python-dotenv
sudo nano /srv/chatpsych/.env

EC2 instance — edit file (example; put your real secrets. There is an example .env file in the chatPsych repo):
```nano
OPENAI_API_KEY=Secret Key

ANTHROPIC_API_KEY=Secret Key

FLASK_SECRET_KEY=Secret Key

researcher_username="chatpsych"
researcher_password="laplace666$"
```

EC2 instance — run:
sudo nano /etc/systemd/system/chatpsych.service

Info only:
- Add this line inside [Service]:
- EnvironmentFile=/srv/chatpsych/.env

EC2 instance — run:
sudo systemctl daemon-reload
sudo systemctl restart chatpsych
sudo systemctl status chatpsych
deactivate

## 6) Optional: swap (stability)

EC2 instance — run:
sudo fallocate -l 1G /swapfile
sudo chmod 0600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -m
sudo nano /etc/fstab

EC2 instance — edit file (add at end):
/swapfile       none            swap    sw              0 0

EC2 instance — run:
sudo reboot

## 7) Final check (Info only)
- Visit your server IP or chatpsych domain. DNS may take up to 6 hours.

## Extra security measures (optional)

### 7.1) Harden SSH

Edit SSH config to improve security, but you'll then need to specify this new port when SSH connecting:

In EC2 instance — run:
```bash
sudo nano /etc/ssh/sshd_config
```

Info only:
- Change the SSH `Port` (e.g., 2222).
- Set `PermitRootLogin no`.
- Add `AllowUsers ubuntu`.

In EC2 instance — run:
```bash
sudo systemctl reload ssh
sudo ufw allow 2222/tcp
```

### 7.2) Enable Firewall (UFW)

In EC2 instance — run:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 7.3) Disable Apache Directory Listing

In EC2 instance — run:
```bash
echo "Options -Indexes" | sudo tee -a /etc/apache2/apache2.conf
sudo systemctl reload apache2
```

### 7.4) Prevent Brute Force (Fail2ban)

In EC2 instance — run:
```bash
sudo apt install fail2ban
sudo systemctl enable --now fail2ban
```

### 7.5) Automatic Security Updates

In EC2 instance — run:
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 7.6) Clean Up Unused Services/Packages

In EC2 instance — run:
```bash
sudo apt autoremove
sudo systemctl disable <unneeded_service>
```

### 7.7) Run Web App As Dedicated Non-root User

Info only:
- Already covered with `chatpsych_user`. Don't use `root` for your app.

---

These steps can help secure your instance a bit more. Only do them after main deployment.

## 8) Setting up server logging

- This section sets up continuous logging of CPU, memory, network traffic, and container logs to JSON files in the `data/server_logs/` directory.
- Logging scripts are included in the `server_log_services/` directory of the repository.

### 8.1) Install monitoring tools

In EC2 instance — run:
```bash
sudo apt install sysstat jq ifstat -y
```

### 8.2) Create server logs directory and make scripts executable

In EC2 instance — run:
```bash
cd /srv/chatpsych
sudo mkdir -p data/server_logs
sudo chown -R chatpsych_user:chatpsych_user data/server_logs
sudo chmod +x server_log_services/*.sh
sudo chown -R chatpsych_user:chatpsych_user server_log_services/
```

### 8.3) Setup automated logging with cron

In EC2 instance — run:
```bash
sudo crontab -e
```

In EC2 instance — add these lines at the end of the crontab file (Ctrl+O, Enter, Ctrl+X):
```cron
# System metrics - every minute
* * * * * /srv/chatpsych/server_log_services/log_system_metrics.sh

# Network traffic - every minute
* * * * * /srv/chatpsych/server_log_services/log_network_traffic.sh

# Docker containers - every 2 minutes
*/2 * * * * /srv/chatpsych/server_log_services/log_docker_containers.sh
```

### 8.4) Test the logging scripts

In EC2 instance — run:
```bash
# Test each script manually
sudo /srv/chatpsych/server_log_services/log_system_metrics.sh
sudo /srv/chatpsych/server_log_services/log_network_traffic.sh
sudo /srv/chatpsych/server_log_services/log_docker_containers.sh

# Check the log files
ls -lh /srv/chatpsych/data/server_logs/*.json
cat /srv/chatpsych/data/server_logs/server_metrics.json | jq '.[0]'
cat /srv/chatpsych/data/server_logs/network_traffic.json | jq '.[0]'
cat /srv/chatpsych/data/server_logs/app_container.json | jq '.[0]'
cat /srv/chatpsych/data/server_logs/nginx_proxy.json | jq '.[0]'
```

### 8.5) View logs

The log file descriptions:
  - `server_metrics.json` - CPU, memory, load average
  - `network_traffic.json` - Network I/O, connection counts
  - `app_container.json` - ChatPsych container stats and logs
  - `nginx_proxy.json` - Nginx proxy container stats and logs

To view logs on server:
```bash
# View latest 5 entries from any log
cat /srv/chatpsych/data/server_logs/server_metrics.json | jq '.[-5:]'
```

Logging runs automatically in the background and does not affect app functionality.

## 9) Live monitoring of server performance

In the EC2 instance — run:
sudo apt install htop
htop
