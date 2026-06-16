const path = require("path");
const pug = require("pug");
const fs = require("fs");
const express = require("express");
const { connectToDatabase } = require("./mwpDB");
const session = require("express-session");
const { ObjectId } = require("mongodb");

const app = express();
const PORT = 3000;

// Configure Express to handle PUG and point it to the PUG pages
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "pages"));

// Built-in middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (no need for manual serveStatic)
app.use("/scripts", express.static(path.join(__dirname, "scripts")));
app.use("/styles", express.static(path.join(__dirname, "styles")));
app.use("/images", express.static(path.join(__dirname, "images")));
app.use(session({
    secret: "mwp-secret",
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// Set up the order history which will have this format:
/* [ { 
      "fees": { "Cinema Time": 1.79, "Stream It": 1.49 }, "subtotal": 20.80, "tax": 3.49, "total": 24.29, "movies": { 
         "Cinema Time": [ { "id": 50, "title": "...", ... }, ..., { "id": 51, "title": "...", ... } ],
         "Stream It":   [ { "id": 1, "title": "...", ... }, { "id": 2, "title": "...", ... }, { "id": 3, "title": "...", ... } ] }},
     { 
      "fees": { "Cinema Time": 1.79, "Stream It": 1.49 }, "subtotal": 20.80, "tax": 3.49, "total": 24.29, "movies": { 
         "Cinema Time": [ { "id": 50, "title": "...", ... }, ..., { "id": 51, "title": "...", ... } ],
         "Stream It":   [ { "id": 1, "title": "...", ... }, { "id": 2, "title": "...", ... }, { "id": 3, "title": "...", ... } ] }},
     { 
      "fees": { "Cinema Time": 1.79, "Stream It": 1.49 }, "subtotal": 20.80, "tax": 3.49, "total": 24.29, "movies": { 
         "Cinema Time": [ { "id": 50, "title": "...", ... }, ..., { "id": 51, "title": "...", ... } ],
         "Stream It":   [ { "id": 1, "title": "...", ... }, { "id": 2, "title": "...", ... }, { "id": 3, "title": "...", ... } ] }},
     ...
   ] */


// Function for counting the total movies ordered
async function calcTotalMovies(db, serviceName) {
    let count = 0;
    const orders = await db.collection("orders").find().toArray();


    for (const order of orders) {
        const moviesForService = order.movies[serviceName];
        if (moviesForService)
            count += moviesForService.length;
    }
       
    return count;
}

// Function for calculating the total sales for a service (includes total fees and total prices)
async function calcTotalSales(db, serviceName) {
    let total = 0;
    const orders = await db.collection("orders").find().toArray();

    // Go through all the orders
    for (const order of orders) {
        // Add the service fee to the total if this order had at least one movie from this service
        if (order.fees[serviceName])
            total += order.fees[serviceName];

        // Add the price of each movie from this service if the service array
        if (order.movies[serviceName]) {
            for (const movie of order.movies[serviceName])
                total += movie.price;
        }
    }
    return total;
}


// Function for finding the average order cost
async function calcAvgOrder(db, serviceName) {
    let allOrdersTotal = 0;
    let validOrders = 0;
    const orders = await db.collection("orders").find().toArray();

    for (const order of orders) {
        if (!order.fees?.[serviceName]) continue; // Skip over orders that do not include this service

        let orderTotal = 0;
        orderTotal += order.fees[serviceName] || 0; // Add the service fee to the total 

        // Add the price of each movie from this service in the service array
        if (order.movies?.[serviceName]) {
            for (const movie of order.movies[serviceName])
                orderTotal += movie.price;
        }

        allOrdersTotal += orderTotal;
        validOrders++;
    }

    return validOrders === 0 ? 0 : allOrdersTotal / validOrders;
}

// Function for finding the most popular movie
async function findMostPopular(db, serviceName) {
    const orders = await db.collection("orders").find().toArray();
    const service = await db.collection("services").findOne({ name: serviceName });
    if(!service) return "";
    
    // Build up a histogram with movie ID's as keys and values being the number of times ordered
    let counts = {};

    for (const order of orders) {
        if (order.movies?.[serviceName]) {
            for (const movie of order.movies[serviceName]) {
                counts[movie.id] = (counts[movie.id] || 0) + 1;
            }
        }
    }

    // Get all movies
    const allMovies = Object.values(service.genres || {}).flat();
    
    // Find the one with the largest count
    let bestCount = -1;
    let bestMovieID = null;
    let bestMovieTitle = "";
    for (const movieID in counts) {
        if (counts[movieID] >= bestCount) {
            // Make sure the movie is still around before making it the best one because it is possible 
            // that the popular movie has been deleted from the movie service since it was ordered.
            const mov = allMovies.find(m => m.id === parseInt(movieID));
            if (mov) {
                bestCount = counts[movieID];
                bestMovieID = parseInt(movieID); 
                bestMovieTitle = mov.title;
            }
        }
    }
    // Return the title of the best movie
    return bestMovieTitle; 
}

//Authorization Helperfunctions
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || !req.session.user.isAdmin) {
        return res.status(403).send("Restricted Access");
    }
    next();
}

// ---------------------------------
// Handle requests for the home page
// ---------------------------------
app.get("/", (req, res) => {
    res.render("index", { user: req.session.user });
});

app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

// ----------------------------------
// Handle requests for the order page
// ----------------------------------
app.get("/order", requireLogin, async (req, res) => {
    const db = await connectToDatabase();
    const services = await db.collection("services").find().toArray();
    
    let basicServiceData = services.map(s => ({
        id: s.id,
        name: s.name,
        minOrder: s.minOrder,
        serviceFee: s.serviceFee
    }));

    res.render("orderForm", { basicServiceData });
});


// ----------------------------------
// Handle requests for the stats page
// ----------------------------------
app.get("/stats", requireLogin, async (req, res) => {
    // Form a JSON object with this format
    // { service1Name: { name: ..., totalOrdered: ..., totalSales: ..., avgCost: ..., mostPopular: ... }, 
    //   service2Name: { name: ..., totalOrdered: ..., totalSales: ..., avgCost: ..., mostPopular: ... }, 
    //   service3Name: { name: ..., totalOrdered: ..., totalSales: ..., avgCost: ..., mostPopular: ... } }

    const db = await connectToDatabase();
    const services = await db.collection("services").find().toArray();

    // Go through the orderHistory and calculate the required information
    const statsData = { };

    //all stats now await MongoDB functions
    for (const service of services) {
        statsData[service.name] = {
            name: service.name,
            totalOrdered: await calcTotalMovies(db, service.name),
            totalSales: await calcTotalSales(db, service.name),
            avgCost: await calcAvgOrder(db, service.name),
            mostPopular: await findMostPopular(db, service.name)
        };
    }

    res.render("stats", { statsData });
});


// ----------------------------------------------------------
// Handle an API request for the streaming-services JSON data
// ----------------------------------------------------------
app.get("/services", requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    const services = await db.collection("services").find().toArray();

    // console.log("Request for services data");

    let basicServicesList = {
        count: services.length,
        services: services.map(s => ({
            id: s.id,
            name: s.name
        }))
    };

    // Examine the accept header
    const accept = req.headers.accept || "";

    // If the client wants JSON, send it. Otherwise render the services page
    if (accept.includes("application/json"))
        res.json(basicServicesList);
    else
        res.render("services", { services: basicServicesList.services });
});


// ---------------------------------------------------------------------------------------------
// Handle users page showing info on all users
// ---------------------------------------------------------------------------------------------
app.get("/users", requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    const users = await db.collection("users").find().toArray();

    const formatted = users.map(u => ({
        id: u._id,
        username: u.username,
        private: u.private
    }));

    // If client wants JSON
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.json(formatted);
    }

    // Otherwise render HTML page
    res.render("users", {
        users: formatted,
        user: req.session.user
    });
});


app.get("/users/:id", requireLogin, async (req, res) => {
    try {
        const db = await connectToDatabase();
        //only allow the user themself or admin to edit user info
        if (req.session.user.id.toString() !== req.params.id && !req.session.user.isAdmin) {
            return res.status(403).send("Restricted Access");
        }

        //Find user
        const user = await db.collection("users").findOne({_id: new ObjectId(req.params.id)});
        //If user doesn't exist
        if (!user) return res.status(404).send("User not found");

        // Get this user's orders
        const orders = await db.collection("orders").find({user: user._id}).toArray();
        const accept = req.headers.accept || "";

        if (accept.includes("application/json")) {
            return res.json({
                id: user._id,
                username: user.username,
                private: user.private
            });
        }

        res.render("userProfile", {
            profile: user,
            orders
        });

    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid user ID");
    }
});


app.put("/users/:id", requireLogin, async (req, res) => {
    try {
        const db = await connectToDatabase();
        //only allow the user themself or admin to edit user info
        if (req.session.user.id.toString() !== req.params.id && !req.session.user.isAdmin) {
            return res.status(403).send("Restricted Access");
        }

        const result = await db.collection("users").updateOne(
            { _id: new ObjectId(req.params.id) },
            {
                $set: {
                    username: req.body.username,
                    password: req.body.password,
                    private: req.body.private
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send("User not found");
        }

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid request");
    }
});

// ---------------------------------------------------------------------------------------------
// Handle user logout
// ---------------------------------------------------------------------------------------------
app.get("/logout", requireLogin, (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// ---------------------------------------------------------------------------------------------
// Handle user login
// ---------------------------------------------------------------------------------------------
app.post("/login", async (req, res) => {
    const db = await connectToDatabase();
    const { username, password } = req.body;

    const user = await db.collection("users").findOne({
        username,
        password
    });

    if (!user) return res.render("login", { error: "Invalid credentials" });

    req.session.user = {
        id: user._id,
        username: user.username,
        isAdmin: user.admin
    };

    res.redirect("/");
});

// ---------------------------------------------------------------------------------------------
// Handle new user registration
// ---------------------------------------------------------------------------------------------
app.post("/register", async (req, res) => {
    const db = await connectToDatabase();
    const { username, password, private } = req.body;

    // Check if username already exists
    const existingUser = await db.collection("users").findOne({ username });
    if (existingUser) return res.render("register", { error: "Username already taken!" });

    // Create new user 
    const newUser = {
        username,
        password,
        admin: false,
        private: private === "on"
    };

    const user = await db.collection("users").insertOne(newUser);

    // Log user in immediately
    req.session.user = {
        id: user.insertedId,
        username: newUser.username,
        isAdmin: false
    };

    res.redirect("/");
});

// ---------------------------------------------------------------------------------------------
// Handle an order submission. Store the order in the history
// ---------------------------------------------------------------------------------------------
app.post("/submit-order", requireLogin, async (req, res) => {
    try {
        const db = await connectToDatabase();
        
        //Find the user's MongoDB _id
        const user = await db.collection("users").findOne({ username: req.session.user.username });
        // Add the user _id to the order
        const order = {
            ...req.body,
            user: user._id
        };
        
        //Insert order
        await db.collection("orders").insertOne(order);
        res.send("Order received");

    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid order data");
    }
});


// ---------------------------------------------------------
// Handle an API request for a streaming-service's JSON data
// ---------------------------------------------------------
app.get("/services/:id", requireLogin, async (req, res) => {
    const db = await connectToDatabase();

    const service = await db.collection("services").findOne({
        id: parseInt(req.params.id)
    });

    // console.log("Request for service " + req.params.id);

    if (!service) 
        return res.status(404).send("Service not found");

    // Examine the accept header
    const accept = req.headers.accept || "";

    // If the client wants JSON, send it. Otherwise render the serviceInfo page
    if (accept.includes("application/json")) 
        res.json(service);
    else 
        res.render("serviceInfo", { service });
});


// ---------------------------------------------------------------------------------
// Handle the updating of a service's Name, Service Fee or Minimum Order information
// ---------------------------------------------------------------------------------
app.put("/services/:sID/info", requireAdmin, async (req, res) => {
    const db = await connectToDatabase();

    // console.log("Request for service info for service " + req.params.sID);
    const sID = parseInt(req.params.sID);

    const result = await db.collection("services").findOneAndUpdate(
        { id: sID },
        {
            $set: {
                ...(req.body.name !== undefined && { name: req.body.name }),
                ...(req.body.minOrder !== undefined && { minOrder: req.body.minOrder }),
                ...(req.body.serviceFee !== undefined && { serviceFee: req.body.serviceFee })
            }
        },
        { returnDocument: "after" }
    );
    
    // Make sure the service ID is valid
    if (!result.value) return res.status(404).json({ error: "Service not found" });

    // Reply with the JSON response containing a success flag
    res.json({ success: true});
});


// ----------------------------------------------------------------
// Handle adding a movie to a service, which is passed in as a JSON 
//{ "genre": "Action", "movie": {
//        "title": "New Adventure",
//        "description": "Epic mission in outer space.",
//        "price": 5.99,
//        "year": 2025 }}
// ----------------------------------------------------------------
app.post("/services/:sID/movies", requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    const sID = parseInt(req.params.sID);
    const service = await db.collection("services").findOne({ id: sID });
    // console.log("Request for adding movie to " + req.params.sID);

    // Make sure the service ID is valid
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    // Get the genre and the movie from the body
    const { genre, movie } = req.body;

    // Handle the case where the genre or movie data is missing
    if (!genre || !movie) 
        return res.status(400).json({ error: "Genre and movie required" });

    // Handle the case where the genre is invalid
    if (!service.genres[genre]) 
        return res.status(400).json({ error: "Genre does not exist" });

    // Find a unique movie ID and set it for the movie object
    const allMovies = Object.values(service.genres).flat();
    const maxID = allMovies.reduce((max, m) => Math.max(max, m.id || 0), 0);
    movie.id = maxID + 1;

    // Add the movie to the genre array
    await db.collection("services").updateOne(
        { id: sID },
        { $push: { [`genres.${genre}`]: movie } }
    );

    // Reply with the JSON response containing a success flag and the entire service data
    res.json({ success: true, service });
});


// --------------------------------------------------------------------------------------
// Handle adding a genre to a service, which is passed in as a JSON { "genre": "Sci-Fi" }
// --------------------------------------------------------------------------------------
app.post("/services/:sID/genres", requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    const sID = parseInt(req.params.sID);
    // console.log("Request for adding genre to " + req.params.sID);
    
    const service = await db.collection("services").findOne({ id: sID });

    // Make sure the service ID is valid
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    // Make sure the name is not empty
    const genreName = req.body.genre?.trim();
    if (!genreName) 
        return res.status(400).json({ error: "Genre name required" });

    // Make sure thet genre is not already there
    if (service.genres?.[genreName]) 
        return res.status(400).json({ error: "Genre already exists" });

    // Add the genre with an empty array of movies
    await db.collection("services").updateOne(
        { id: sID },
        { $set: { [`genres.${genreName}`]: [] } }
    );

    // Reply with the JSON response containing a success flag and the entire service data
    res.json({ success: true, service });
});


// -----------------------------------------------------
// Handle the deleting of a movie with the given movieID
// -----------------------------------------------------
app.delete("/services/:sID/movies/:movieID", requireAdmin, async (req, res) => {
    const db = await connectToDatabase();

    // console.log("Request for deleting movie " + req.params.movieID + " from " + req.params.sID);
    const sID = parseInt(req.params.sID);
    const movieID = parseInt(req.params.movieID);

    const service = await db.collection("services").findOne({ id: sID });

    // Make sure the service ID is valid
    if (!service) 
        return res.status(404).json({ error: "Service not found" });

    let deleted = false;

    // Go through each genre to find the movie
    for (const genre in service.genres) {
        // Go through the movies in the array for that genre and keep all that do not have this movie ID
        const originalLength = service.genres[genre].length;
        service.genres[genre] = service.genres[genre].filter(m => m.id !== movieID);

        // If a movie was removed, it must have matched that ID, flag as having been deleted
        if (service.genres[genre].length < originalLength) 
            deleted = true;
    }

    // If the movie ID was not found, return an error
    if (!deleted) 
        return res.status(404).json({ error: "Movie not found" });

    //replace full document in DB
    await db.collection("services").updateOne(
        { id: sID },
        { $set: { genres: service.genres } }
    );

    // Reply with the JSON response containing a success flag and the entire service data
    res.json({ success: true, service });
});


// ---------------------------------------------------
// Handle the deleting of a service with the given sID
// ---------------------------------------------------
app.delete("/services/:sID", requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    // console.log("Request for deleting service " + req.params.sID);
    const sID = parseInt(req.params.sID);
    // Make sure the service ID is valid
    const service = await db.collection("services").deleteOne({ id: sID });

    if (service.deletedCount === 0) 
        return res.status(404).json({ error: "Service not found" });

    // Reply with the JSON response containing a success flag
    res.json({ success: true });
});


// ----------------------------------
// Handle the adding of a new service
// ----------------------------------
app.post("/services", requireAdmin, async (req, res) => {
    // console.log("Request adding a service " + req.body.name);
    const db = await connectToDatabase();

    // Make sure that a name was provided
    const { name } = req.body;
    if (!name) 
        return res.status(400).json({ error: "Service name required" });

    // Find the max existing ID
    const service = await db.collection("services").find().toArray();
    const maxId = service.length 
        ? Math.max(...service.map(s => s.id)) 
        : 0;

    // Create a new service object
    const newService = {
        id: maxId + 1,
        name,
        minOrder: 0,
        serviceFee: 0,
        genres: {}
    };

    // Add the streaming service
    await db.collection("services").insertOne(newService);

    // Reply with the JSON response containing a success flag and the new service data
    res.json({ success: true, service: newService });
});


// -------------------------------------------------
// Handle the deleting of a user given their id
// -------------------------------------------------
app.delete("/users/:id", requireAdmin, async (req, res) => {
    try {
        const db = await connectToDatabase();
        const result = await db.collection("users").deleteOne({
            _id: new ObjectId(req.params.id)
        });

        if (result.deletedCount === 0) return res.status(404).send("User not found");

        res.json({ success: true, message: "User deleted successfully" });

    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid user ID");
    }
});

// --------------------------------
// Handle anything else as an error
// --------------------------------
app.use((req, res) => {
    res.status(404).send("Not Found");
});


async function startServer() {
    console.log("Connecting to DB...");
    const db = await connectToDatabase();
    console.log("Connected to DB");

    let c = await db.collection("services").find();
    console.log("Here are the streaming services in the database:");
    for await (const p of c) console.log(JSON.stringify(p, null, 2));

    c = await db.collection("users").find();
    console.log("Here are the users in the database:");
    for await (const p of c) console.log(JSON.stringify(p, null, 2));

    c = await db.collection("orders").find();
    console.log("Here are the orders in the database:");
    for await (const p of c) console.log(JSON.stringify(p, null, 2));
    
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

//Start server
startServer();

// console.log(`"Weekend Movie" Planner Server running on http://localhost:${PORT}`);