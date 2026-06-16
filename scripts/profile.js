async function updateProfile(event) {
    event.preventDefault();
    const id = document.getElementById("userId").value;
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirmPassword").value;
    const isPrivate = document.getElementById("private").checked;

    // Validation
    if (!username || !password || !confirm) {
        alert("All fields are required");
        return;
    }

    if (password !== confirm) {
        alert("Passwords do not match");
        return;
    }

    const res = await fetch(`/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username,
            password,
            private: isPrivate
        })
    });

    if (!res.ok) {
        alert("Update failed");
        return;
    }

    alert("Profile updated successfully");
}