-- Seed file 03: Courses and Majors


-- ======================================================================
-- Bachelor of Computer Science
-- ======================================================================
INSERT INTO courses (code, name) VALUES
    ('BA-CS', 'Bachelor of Computer Science');

INSERT INTO majors (course_id, name)
SELECT id, unnest(ARRAY[
    'Artificial Intelligence',
    'Cybersecurity',
    'Data Science',
    'Internet of Things',
    'Software Development'
])
FROM courses WHERE code = 'BA-CS';

