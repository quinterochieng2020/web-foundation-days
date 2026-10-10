
const loadButton = document.getElementById("loadUsers");
const status = document.getElementById("status");
const usersContainer = document.getElementById("users");
const filterInput = document.getElementById("filter");

let users = [];

// Load users from the API
async function loadUsers() {
    loadButton.disabled = true;
    status.textContent = "Loading users...";

    try {
        const response = await fetch(
            "https://jsonplaceholder.typicode.com/users"
        );

        // Check whether the request was successful
        if (!response.ok) {
            throw new Error("Failed to fetch users.");
        }

        users = await response.json();

        renderUsers(users);

        status.textContent = `Successfully loaded ${users.length} users.`;
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
        usersContainer.replaceChildren();
    } finally {
        loadButton.disabled = false;
    }
}

// Display any list of users
function renderUsers(list) {
    usersContainer.replaceChildren();

    if (list.length === 0) {
        status.textContent = "No users match your filter.";
        return;
    }

    list.forEach(user => {
        const userDiv = document.createElement("div");
        const name = document.createElement("h3");
        const email = document.createElement("p");
        const city = document.createElement("p");
        const company = document.createElement("p");

        name.textContent = user.name;
        email.textContent = `Email: ${user.email}`;
        city.textContent = `City: ${user.address.city}`;
        company.textContent = `Company: ${user.company.name}`;

        userDiv.appendChild(name);
        userDiv.appendChild(email);
        userDiv.appendChild(city);
        userDiv.appendChild(company);

        usersContainer.appendChild(userDiv);
    });
}

// Load users when the button is clicked
loadButton.addEventListener("click", loadUsers);

// Filter stored users without making another API request
filterInput.addEventListener("input", () => {
    const searchText = filterInput.value.toLowerCase().trim();

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchText)
    );

    renderUsers(filteredUsers);
});
