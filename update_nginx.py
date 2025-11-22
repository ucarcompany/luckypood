import paramiko
import sys

def update_nginx():
    hostname = '38.22.95.235'
    username = 'root'
    password = 'zTpctEKQ2KqsP2qX'
    
    print(f"Connecting to {hostname}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(hostname, username=username, password=password)
        print("Connected successfully.")
        
        nginx_config = """
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/luckypood-user;
    index index.html;

    server_name _;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
"""
        print("\n>>> Updating Nginx configuration...")
        sftp = client.open_sftp()
        with sftp.file("/etc/nginx/sites-available/default", "w") as f:
            f.write(nginx_config)
        sftp.close()
        
        print("\n>>> Reloading Nginx...")
        stdin, stdout, stderr = client.exec_command("service nginx reload")
        print(stdout.read().decode())
        print(stderr.read().decode())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    update_nginx()