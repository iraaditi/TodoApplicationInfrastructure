Step 1: 
Log into the AWS Console and go to EC2 > Auto Scaling Groups.

Select the redis-asg and click Edit.

Change the capacities back to: Desired: 1, Minimum: 1, Maximum: 1.

Click Update.

Go to the EC2 Instances dashboard. Within 1-2 minutes, a brand new instance will launch from our custom AMI Blueprint.

Wait for the Instance State to say Running, then copy the new Public IPv4 address.

------------------------------
Step 2: 
Update Local Credentials

Open `backend/.env`.

Update the `REDIS_HOST` variable with the new AWS Public IP:

Code snippet
```
REDIS_HOST=your_new_aws_ip_here
REDIS_PORT=6379
```
Save the file.
--------------------------------

Step 3: Start Kubernetes

Start Docker Desktop.

Ensure Kubernetes is running: `kubectl get nodes`

Delete the old secret holding the old IP address:

Bash
`kubectl delete secret backend-secrets`
Create the new secret from your updated .env file:

Bash
`kubectl create secret generic backend-secrets --from-env-file=backend/.env`

------------------------------
Step 4: Restart the Backend & Prove Redis Connection
Now we force the backend pods to restart so they fetch the new AWS IP from the Kubernetes secret vault.

Restart the deployment:

Bash
`kubectl rollout restart deployment todo-backend`
Wait a few seconds, then find the name of your new backend pod:

Bash
`kubectl get pods`
Look at the logs for that pod to prove the connection to the AWS Cloud is successful:

Bash
`kubectl logs <your-new-backend-pod-name>`

-------------------------------------
Step 5: SSH into the AWS Server & Verify Cache Data
To prove that our application data is actually being stored in the AWS Cloud, we can securely connect to our EC2 instance using our SSH key and inspect the Redis database directly.

1. Secure the Key (Mac/Linux/WSL only)
Open a terminal and navigate to the folder where your .pem key is saved. AWS requires strict permissions on key files. Run this once:

Bash
`chmod 400 your-key-name.pem`
2. Connect to the Ubuntu Server
Use the SSH command with your .pem file and the new Public IP address of your AWS instance:

Bash
`ssh -i "your-key-name.pem" ubuntu@<your_new_aws_ip_here>`
(Type yes if it asks if you want to continue connecting).

3. Inspect the Redis Database
Once you see the green ubuntu@ip-... prompt, you are officially inside the AWS cloud server. Open the Redis Command Line Interface:

Bash
`redis-cli`
4. View the Data
Now you can prove the app is caching data here:

Type KEYS * and press Enter. You will see a list of all the keys currently saved by your backend (e.g., "todos").

Type GET <key-name> (for example: GET todos) and press Enter. You will see the actual raw JSON data of your Todo list!

5. Disconnect

Type exit to leave the Redis CLI.

Type exit again to close the SSH connection and return to your local computer.