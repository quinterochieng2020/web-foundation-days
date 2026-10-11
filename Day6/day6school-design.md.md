# School Database System Design

## Table Explanations
* **`students`**: Stores personal information and contact details for each student registered in the school. Each student has a unique identifier and a unique email address.
* **`courses`**: Stores information about the subjects or classes offered by the school, including their titles and unique course codes.
* **`enrolments`**: Acts as a join table linking students to courses. It tracks which students are taking which courses and stores the grade achieved for that specific enrolment.

## Relationships & The Join Table
* **Students to Courses (Many-to-Many)**: A single student can enroll in multiple courses, and a single course can have many students enrolled in it.
* **Why a Join Table is Needed**: Relational databases cannot directly store native many-to-many relationships in a single table without data duplication or breaking normalization rules. The `enrolments` join table breaks this relationship down into two manageable one-to-many relationships (`students` to `enrolments` and `courses` to `enrolments`), while also providing a natural home for relationship-specific attributes like `grade`.

## Database Index
* **Index**: An index should be added to `enrolments(student_id)` and `enrolments(course_id)`.
* **Reason**: Because filtering, joining, and aggregating queries frequently search through enrolment records by student or course (such as listing all courses for a student or counting students per course), indexing these foreign key columns speeds up lookups significantly, preventing full table scans as the dataset grows.

## SQL vs. NoSQL
For this school management system, **SQL** is the clear and superior choice. A school environment relies heavily on highly structured data, strict referential integrity (ensuring enrolments always point to valid students and courses), and atomic transactions (such as grade updates). SQL relational databases naturally enforce these constraints using foreign keys, unique constraints, and ACID properties, making them ideal for handling connected entities like students, teachers, classes, and grades.