# Architecture & Infrastructure Documentation

## 1. High-Level Overview
This application is a highly scalable, full-stack microservices platform. It moves away from traditional monolithic design by isolating responsibilities into distinct, containerized services. 

By leveraging **Docker** for containerization and **Kubernetes (K8s)** for local orchestration, the application achieves a modular architecture. We then bridge our local Kubernetes cluster with cloud infrastructure, utilizing **AWS (Amazon Web Services)** for high-availability caching, **GCP (Google Cloud Platform)** for secure authentication, and **Razorpay** for handling financial transactions.

The architecture is designed to demonstrate:
1. **Container Orchestration:** Using Kubernetes to manage, scale, and heal frontend and backend services.
2. **Hybrid-Cloud Networking:** Allowing local K8s pods to securely communicate with a remote AWS EC2 instance.
3. **Enterprise-Grade Security:** Offloading user authentication to Google via GCP and offloading payment compliance (PCI-DSS) to Razorpay.
4. **Data Optimization:** Implementing an in-memory caching tier (Redis) to reduce read-loads on the primary database (MongoDB).

---

## 2. Component Breakdown & Libraries

### A. The Frontend (Client UI)
The presentation layer is a Single Page Application (SPA) built for speed and responsiveness. It is containerized and runs inside a K8s pod.
* **Core Technology:** React.js compiled with Vite.
* **Key Libraries:**
  * `@react-oauth/google`: Renders the official Google Sign-in iframe and handles the client-side OAuth flow.
  * `axios`: Configured with interceptors to attach authentication tokens to every outgoing backend request.
  * `react-router-dom`: Enables seamless, refresh-free page transitions.
* **Architecture Role:** Serves as the user's entry point. It holds no sensitive business logic. It simply requests data from the backend APIs and displays it to the user.

### B. The Backend (Core API)
The central nervous system of the application. It acts as the gateway between the user's browser, the databases, and third-party APIs like Razorpay.
* **Core Technology:** Node.js with Express.js.
* **Key Libraries:**
  * `express`: Routes HTTP traffic (GET, POST, PUT, DELETE).
  * `razorpay`: The official Node SDK to securely generate payment orders and verify transaction signatures.
  * `google-auth-library`: Used to cryptographically verify the JWT tokens sent by the frontend to ensure the user really is who they say they are.
  * `mongoose`: The ODM (Object Data Modeling) library used to interact with MongoDB.
  * `redis`: Connects to the AWS Redis server to fetch cached data.
* **Architecture Role:** Validates all incoming requests, manages business logic (e.g., checking if a user has paid for premium features), and orchestrates data fetching between Redis and MongoDB.

### C. Authentication Tier (Google Cloud Platform - GCP)
Instead of forcing users to create new passwords (which is a security risk), we offload Identity and Access Management (IAM) to Google.
* **How it works:** We utilized the **GCP Console** to provision an OAuth 2.0 Client ID. When a user clicks "Sign in with Google," our frontend requests a secure Identity Token directly from Google's servers. Google checks our configured "Authorized JavaScript Origins" (e.g., `http://localhost:3000`) to prevent unauthorized domains from stealing the login prompt.
* **The Flow:**
  1. User clicks login; Google returns a JWT (JSON Web Token) to the React frontend.
  2. React sends this JWT to our Node.js backend.
  3. Node.js uses GCP libraries to verify the token's cryptographic signature.
  4. If valid, the backend creates a session for the user.

### D. Financial Engine (Razorpay)
To handle payments (e.g., for premium subscriptions or paid features), we integrated Razorpay. For security and PCI compliance, credit card data never touches our backend or database.
* **The Flow:**
  1. **Order Creation:** The user clicks "Buy." React asks the backend to initiate a payment. The Node backend uses its secret API keys to tell Razorpay's servers to create an "Order ID."
  2. **The Checkout:** The backend sends the Order ID to React. React opens the Razorpay popup. The user enters their card details securely into Razorpay's iframe.
  3. **Signature Verification:** Once paid, Razorpay sends a success response back to React, including a cryptographic signature. React forwards this to our Node backend.
  4. **The Handshake:** Node.js uses its Razorpay Secret Key to hash the data and verify that the signature is 100% authentic. If it matches, the user's account is upgraded in MongoDB.

### E. The Caching Tier (AWS EC2 + Redis)
To make the application blazing fast, we intercept database reads using Redis.
* **Core Technology:** Redis hosted on an Ubuntu Linux AWS EC2 instance.
* **High Availability via ASG:** The EC2 instance is managed by an **AWS Auto Scaling Group**. If the server crashes, AWS detects the failure and automatically spins up an exact clone using our Custom AMI (Amazon Machine Image). 
* **Security:** Secured by an AWS Security Group acting as a firewall, allowing traffic *only* on port `22` (for admin SSH via `.pem` key) and port `6379` (for Redis API traffic).

### F. The Persistent Database (MongoDB)
The ultimate source of truth for the application. If AWS goes down, or the backend pods crash, the user data, payment statuses, and Todo items remain safely stored here.

---

## 3. Infrastructure & Orchestration (Kubernetes)

To run this architecture reliably, we use Kubernetes to orchestrate the Docker containers.

* **Deployments:** We use `deployment.yaml` files for the frontend and backend. These define how many "replicas" (copies) of our app should be running. If a pod crashes due to a bug, K8s immediately creates a new one to replace it.
* **Services:** We use `service.yaml` files to create stable internal network addresses. Because pod IP addresses change every time they crash, Services act as reliable load balancers so the frontend can always find the backend.
* **Secrets Management:** Passwords, AWS IPs, and Razorpay API Keys are never hardcoded. We use `kubectl create secret` to store these in a secure Kubernetes vault, which injects them into the backend pods as standard Environment Variables (`process.env`) at runtime. 

## 4. The Complete Data Flow Example

*Here is what happens when a user signs in and views their premium Todo list:*

1. **Auth (GCP):** User arrives at the React frontend and clicks "Sign in". Google (GCP) verifies the user and returns an identity token.
2. **Validation:** React sends the token to the Node backend. Node verifies the token and checks MongoDB to see if the user has a "Premium" status (previously paid via **Razorpay**).
3. **Cache Hit (AWS):** The backend needs the user's Todo list. It first reaches out over the internet to the **AWS Redis** server. 
4. **Cache Miss/DB Read:** If the data isn't in Redis, the backend queries **MongoDB**. It then saves a copy of that data to AWS Redis so the next request is 10x faster.
5. **Response:** The Node backend packages the data and sends it back to the React frontend to render on the screen.


## Project Synopsis
**What I built:**
- In this project, I built a modern, production-ready full-stack application that goes far beyond a basic coding tutorial. Instead of running everything on a single server, I split the application into independent microservices—a React frontend, a Node.js API, and a MongoDB database—and packaged them into Docker containers. I used Kubernetes to orchestrate and manage these containers, ensuring the app stays online even if a piece crashes. To make the app incredibly fast, I connected my local environment to the real cloud, deploying a "self-healing" Redis cache on AWS using an Auto Scaling Group. Finally, I integrated Google Cloud Platform (GCP) for secure, passwordless authentication and Razorpay to handle premium feature transactions. Ultimately, this project demonstrates my ability to design, build, and connect a secure, cloud-integrated microservices architecture just like enterprise tech companies do.

