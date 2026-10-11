Library API: Books Endpoints
List All Books
Method: GET

Path: /books

Description: Retrieve a paginated list of all books available in the library catalog.

Success Status Code: 200 OK
2. List Books by Author
Method: GET

Path: /books?author={author_name}

Description: Retrieve a filtered list of books written by a specific author using a query parameter.

Success Status Code: 200 OK
Example Request: GET /books?author=J.R.R.+Tolkien
3. Get One Book
Method: GET

Path: /books/{id}

Description: Retrieve detailed information for a single book by its unique identifier.

Success Status Code: 200 OK

4. Create a Book
Method: POST

Path: /books

Description: Add a new book record to the library catalog.

Success Status Code: 201 Created

Example Request Body:

{
  "title": "The Hobbit",
  "author": "J.R.R. Tolkien",
  "published_year": 1937,
  "isbn": "978-0547928227"
}
5. Update a Book
Method: PUT

Path: /books/{id}

Description: Fully update or replace an existing book's details by its unique identifier.

Success Status Code: 200 OK

Example Request Body:
{
  "title": "The Hobbit: Revised Edition",
  "author": "J.R.R. Tolkien",
  "published_year": 1951,
  "isbn": "978-0547928227"
}
6. Delete a Book
Method: DELETE

Path: /books/{id}

Description: Remove a book from the library catalog permanently.

Success Status Code: 204 No Content

Error Handling
400 Bad Request
When it happens: Triggered when the client sends malformed data, missing required fields during creation, or invalid data types.

Example: Sending a POST /books request with a missing title field or where published_year is passed as a string instead of an integer:
{
  "author": "J.R.R. Tolkien",
  "published_year": "nineteen-thirty-seven"
}
404 Not Found
When it happens: Triggered when a client attempts to retrieve, update, or delete a book using an ID that does not exist in the database.

Example: Requesting GET /books/99999 when no book with ID 99999 is stored in the system.
