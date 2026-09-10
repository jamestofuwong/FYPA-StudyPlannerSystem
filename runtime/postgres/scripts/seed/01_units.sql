-- Seed file 01: Units

INSERT INTO units (unit_code, unit_name) VALUES

    ('COS10003', 'Computer and Logic Essentials'),
    ('COS10004', 'Computer Systems'),
    ('COS10009', 'Introduction to Programming'),
    ('COS10011', 'Creating Web Applications'),
    ('COS10022', 'Introduction to Data Science'),
    ('COS10025', 'Technology in an Indigenous Context Project'),
    ('COS10026', 'Web Technology Project'),
    ('COS10082', 'Applied Analytics in Business'),

    ('COS20001', 'User-Centred Design'),
    ('COS20007', 'Object-oriented Programming'),
    ('COS20015', 'Fundamentals of Data Management'),
    ('COS20019', 'Cloud Computing Architecture'),
    ('COS20028', 'Big Data Architecture and Application'),
    ('COS20030', 'Malware Analysis'),
    ('COS20031', 'Database Design Project'),
    ('COS20083', 'Advanced Data Analytics'),
    

    ('COS30008', 'Data Structure and Patterns'),
    ('COS30015', 'IT Security'),
    ('COS30017', 'Software Development for Mobile Devices'),
    ('COS30018', 'Intelligent Systems'),
    ('COS30019', 'Introduction to Artificial Intelligence'),
    ('COS30020', 'Advanced Web Development'),
    ('COS30041', 'Creating Secure and Scalable Software'),
    ('COS30043', 'Interface Design and Development'),
    ('COS30045', 'Data Visualisation'),
    ('COS30047', 'Security Operations Centre'),
    ('COS30049', 'Computing Technology Innovation Project'),
    ('COS30081', 'Fundamentals of Natural Language Processing'),
    ('COS30082', 'Applied Machine Learning'),
    
    ('COS40003', 'Concurrent Programming'),
    ('COS40005', 'Computing Technology Project A'),
    ('COS40006', 'Computing Technology Project B'),
    ('COS40007', 'Artificial Intelligence for Engineering'),


    ('ICT20016', 'Work-Integrated Learning'),
    ('ICT20016*Optional', 'Work-Integrated Learning'),

    ('ICT30005', 'Professional Issues in IT'),
    ('ICT30010', 'eForensic Fundamentals'),
    
    ('INF10003', 'International Business Operations'),
    ('INF10024', 'Business Digitalisation'),
    ('INF30020', 'Information Systems Risk and Security'),


    ('MGT10010', 'Ethics of Innovation'),

    -- MPU Units
    ('MPU3142', 'Malay Language Communication 2'),
    ('MPU3143', 'Malay Language Communication 2'), -- old planner

    ('MPU3182', 'Penghayatan Etika dan Peradaban'),
    ('MPU3183', 'Penghayatan Etika dan Peradaban'), -- old planner

    ('MPU3192', 'Philosophy and Current Issues'),
    ('MPU3193', 'Philosophy and Current Issues'), -- old planner

    ('MPU3212', 'Bahasa Kebangsaan A'),

    ('MPU3272', 'Integrity and Anti-Corruption'),
    ('MPU3273', 'Integrity and Anti-Corruption'), -- old planner

    ('MPU3412', 'Service Learning'),

    ('STA10003', 'Foundations of Statistics'),

    ('SWE20001', 'Managing Software Projects'),
    ('SWE20004', 'Technical Software Development'),
    ('SWE30003', 'Software Architecture and Design'),
    ('SWE30009', 'Software Testing and Reliability'),
    ('SWE30011', 'IoT Programming'),
    ('SWE30012', 'IoT Launcher Project'),
    ('SWE40001', 'Software Engineering Project A'),
    ('SWE40002', 'Software Engineering Project B'),
    ('SWE40006', 'Software Deployment and Evolution'),
    
    ('TNE10005', 'Network Administration'),
    ('TNE10006', 'Networks and Switching'),
    ('TNE20002', 'Network Routing Principles'),
    ('TNE20003', 'Internet and Cybersecurity for Engineering Applications'),
    ('TNE30009', 'Network Security & Resilience'),
    ('TNE30012', 'Secure Remote Access Networks');


-- ======================================================================================================================
-- Seeding Unit Offerings
-- ======================================================================================================================

-- Units offered only in Semester 1
SELECT add_unit_offering('COS20015', 1);
SELECT add_unit_offering('COS20083', 1);

SELECT add_unit_offering('COS30018', 1);
SELECT add_unit_offering('COS30043', 1);
SELECT add_unit_offering('COS30047', 1);


SELECT add_unit_offering('SWE40006', 1);


SELECT add_unit_offering('TNE10005', 1);

-- Units offered only in Semester 2
SELECT add_unit_offering('COS10082', 2);

SELECT add_unit_offering('COS20028', 2);
SELECT add_unit_offering('COS20030', 2);

SELECT add_unit_offering('COS30008', 2);
SELECT add_unit_offering('COS30017', 2);
SELECT add_unit_offering('COS30020', 2);
SELECT add_unit_offering('COS30045', 2);
SELECT add_unit_offering('COS30082', 2);


SELECT add_unit_offering('SWE30009', 2);


SELECT add_unit_offering('TNE30009', 2);

-- Units offered in both Semester 1 and Semester 2
SELECT add_unit_offering('COS10003', 1); SELECT add_unit_offering('COS10003', 2);
SELECT add_unit_offering('COS10004', 1); SELECT add_unit_offering('COS10004', 2);
SELECT add_unit_offering('COS10009', 1); SELECT add_unit_offering('COS10009', 2);
SELECT add_unit_offering('COS10022', 1); SELECT add_unit_offering('COS10022', 2);
SELECT add_unit_offering('COS10025', 1); SELECT add_unit_offering('COS10025', 2);
SELECT add_unit_offering('COS10026', 1); SELECT add_unit_offering('COS10026', 2);

SELECT add_unit_offering('COS20007', 1); SELECT add_unit_offering('COS20007', 2);

SELECT add_unit_offering('COS30049', 1); SELECT add_unit_offering('COS30049', 2);

SELECT add_unit_offering('COS40005', 1); SELECT add_unit_offering('COS40005', 2);
SELECT add_unit_offering('COS40006', 1); SELECT add_unit_offering('COS40006', 2);


SELECT add_unit_offering('INF10024', 1); SELECT add_unit_offering('INF10024', 2);


SELECT add_unit_offering('TNE10006', 1); SELECT add_unit_offering('TNE10006', 2);


SELECT add_unit_offering('SWE30003', 1); SELECT add_unit_offering('SWE30003', 2);