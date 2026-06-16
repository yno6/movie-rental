# Description: 
              This is a Weekend Movie Planner web application built using Node.js, Express, MongoDB, and Pug.
              The application allows users to:
                                               - Register and log in
                                               - Browse streaming services and available movies
                                               - Place movie orders across multiple services
                                               - View their order history
                                               - View statistics about movie orders and services
               Admins have additional privileges such as:
                                               - Managing streaming services (add/edit/delete)
                                               - Managing movies and genres within services
                                               - Viewing all users and deleting users

# File Structure:
                        ├── images/                 # Icons (select/remove buttons svg)
                        ├── pages/                  # Pug templates (views)
                        │   ├── header.pug
                        │   ├── index.pug
                        │   ├── logIn.pug
                        │   ├── orderForm.pug  
                        │   ├── register.pug         
                        │   ├── serviceInfo.pug            
                        │   ├── services.pug
                        │   ├── stats.pug
                        │   ├── userProfile.pug
                        │   └── users.pug
                        │                        
                        ├── scripts/                # Client-side JavaScript
                        │   ├── header.js
                        │   ├── interact.js         # Order page logic (movies, cart, totals)
                        │   ├── profile.js          # User profile interactions
                        │   ├── serviceInfo.js      # Service details (genres + movies management) 
                        │   ├── services.js         # Service list management (add/delete services)         
                        │   └── users.js            # User management
                        │
                        ├── streamingServices/      # JSON files storing service data
                        ├── styles/                 #styling css files
                        │
                        ├── initializeDatabase.js   # Seeds database with initial data
                        ├── mwpDB.js                # MongoDB connection setup
                        ├── server.js               # Express server + API routes
                        ├── README.md               # Project Documentation

# Design-decisions: 
    - MVC-like structure:
        The project separates concerns using:
            - Pug templates for views
            - Express routes for controllers
            - MongoDB for data storage
    - Session-based authentication: User login state is managed using express-session.
    - Authorization controls:
            - Only logged-in users can access protected routes
            - Only admins can manage services and users
            - Users can only modify their own profiles (or admins can)
    - Dynamic rendering with Pug:
            - Pages are rendered server-side with dynamic data passed into templates.
    - RESTful API design:
            - GET → retrieve data
            - POST → create
            - PUT → update
            - DELETE → remove
    - Modular client-side scripts, separate JS files handle specific pages for better organization.

# How to Run the Server:
                        1 - Open a terminal in the project folder.
                        2 - Install required dependencies if not already installed 
                        (i.e. npm init, npm instal pug, npm install express, npm install express-session and npm install mongodb)
                        3 - Start the server by typing  'node server.js'  in the terminal
                        4 - Confirm the server is running. You should see a message in the terminal indicating the server has started (typically on http://localhost:3000).
                        5 - Open the website on your browser
