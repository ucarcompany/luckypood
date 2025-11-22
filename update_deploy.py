import paramiko
import time
import sys

def update():
    hostname = '38.22.95.235'
    username = 'root'
    password = 'zTpctEKQ2KqsP2qX'
    
    print(f"Connecting to {hostname}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(hostname, username=username, password=password)
        print("Connected successfully.")
        
        commands = [
            "cd /opt/luckypood && git fetch origin && git reset --hard origin/main",
            "cd /opt/luckypood && npm install",
            "cd /opt/luckypood && npm run -w frontend build",
            "cp -r /opt/luckypood/frontend/dist/* /var/www/luckypood-user/",
            "pm2 restart lucky-backend"
        ]
        
        for cmd in commands:
            print(f"\n>>> Executing: {cmd}")
            stdin, stdout, stderr = client.exec_command(cmd)
            
            # Wait for command to complete and stream output
            while not stdout.channel.exit_status_ready():
                if stdout.channel.recv_ready():
                    out = stdout.channel.recv(1024).decode('utf-8')
                    sys.stdout.write(out)
                if stderr.channel.recv_ready():
                    err = stderr.channel.recv(1024).decode('utf-8')
                    sys.stderr.write(err)
            
            # Print remaining output
            sys.stdout.write(stdout.read().decode('utf-8'))
            sys.stderr.write(stderr.read().decode('utf-8'))
            
            exit_status = stdout.channel.recv_exit_status()
            if exit_status != 0:
                print(f"Command failed with exit status {exit_status}")
                if "build" in cmd:
                    return
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    update()