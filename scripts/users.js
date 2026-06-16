async function deleteUser(id, event) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
        const res = await fetch(`/users/${id}`, {
            method: "DELETE"
        });

        // Try to read response as JSON
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            alert(data?.message || "Failed to delete user");
            return;
        }

        alert(data?.message || "User deleted");

        //remove from page instantly (No reload needed)
        event.target.closest("li").remove();
    } catch (err) {
        console.error(err);
        alert("Error deleting user");
    }
}