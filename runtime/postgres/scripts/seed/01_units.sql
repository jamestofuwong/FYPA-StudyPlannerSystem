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
    ('ICT20016*Optional', 'Work-Integrated Learning'), -- old planner

    ('ICT30005', 'Professional Issues in IT'),
    ('ICT30010', 'eForensic Fundamentals'),
    
    ('INF10003', 'International Business Operations'),
    ('INF10024', 'Business Digitalisation'),
    ('INF30020', 'Information Systems Risk and Security'),


    ('MGT10010', 'Ethics of Innovation'),

    -- MPU Units
    ('MPU3112', 'Kursus Integriti dan Antirasuh (KIAR) (Malaysian and International Students)'),
    ('MPU3122', 'Falsafah dan Cabaran Semasa (Malaysian Students Only)'),
    ('MPU3142', 'Malay Language Communication 2 (International Students Only)'),
    ('MPU3143', 'Malay Language Communication 2'), -- old planner
    ('MPU3152', 'Citra Malaysia (International Students Only)'),
    ('MPU3172', 'Aspirasi Negara Bangsa (Malaysian Students Only'),
    ('MPU3182', 'Penghayatan Etika dan Peradaban (Malaysian Students Only)'),
    ('MPU3183', 'Penghayatan Etika dan Peradaban'), -- old planner

    ('MPU3192', 'Philosophy and Current Issues (Malaysian and International Students)'),
    ('MPU3193', 'Philosophy and Current Issues'), -- old planner

    ('MPU3212', 'Bahasa Kebangsaan A (Malaysian students who do not have SPM Bahasa Melayu credit)'),
    ('MPU3222', 'Career Development (Malaysian and International Students)'),
    ('MPU3272', 'Integrity and Anti-Corruption (Malaysian and International Students)'),
    ('MPU3273', 'Integrity and Anti-Corruption'), -- old planner

    ('MPU3312', 'Academic Integrity and Professional Conduct (Malaysian and International Students)'),

    ('MPU3412', 'Service Learning (Malaysian and International Students)'),

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
SELECT add_unit_offering('COS30081', 1);
SELECT add_unit_offering('COS40007', 1);

SELECT add_unit_offering('ICT30010', 1);

SELECT add_unit_offering('STA10003', 1);

SELECT add_unit_offering('SWE30011', 1);
SELECT add_unit_offering('SWE40006', 1);

SELECT add_unit_offering('TNE10005', 1);
SELECT add_unit_offering('TNE20002', 1);
SELECT add_unit_offering('TNE20003', 1);
SELECT add_unit_offering('TNE30012', 1);


-- Units offered only in Semester 2
SELECT add_unit_offering('COS10082', 2);
SELECT add_unit_offering('COS20028', 2);
SELECT add_unit_offering('COS20030', 2);
SELECT add_unit_offering('COS30008', 2);
SELECT add_unit_offering('COS30020', 2);
SELECT add_unit_offering('COS30041', 2);
SELECT add_unit_offering('COS30045', 2);
SELECT add_unit_offering('COS30082', 2);
SELECT add_unit_offering('COS40003', 2);


SELECT add_unit_offering('INF30020', 2);

SELECT add_unit_offering('SWE30009', 2);
SELECT add_unit_offering('SWE30012', 2);

SELECT add_unit_offering('TNE30009', 2);


-- Units offered only in Winter Term
SELECT add_unit_offering('ICT20016*Optional', 4);


-- Units offered in both Semester 1 and Semester 2
SELECT add_unit_offering('COS10003', 1); SELECT add_unit_offering('COS10003', 2);
SELECT add_unit_offering('COS10004', 1); SELECT add_unit_offering('COS10004', 2);
SELECT add_unit_offering('COS10009', 1); SELECT add_unit_offering('COS10009', 2);
SELECT add_unit_offering('COS10011', 1); SELECT add_unit_offering('COS10011', 2);
SELECT add_unit_offering('COS10022', 1); SELECT add_unit_offering('COS10022', 2);
SELECT add_unit_offering('COS10025', 1); SELECT add_unit_offering('COS10025', 2);
SELECT add_unit_offering('COS10026', 1); SELECT add_unit_offering('COS10026', 2);
SELECT add_unit_offering('COS20001', 1); SELECT add_unit_offering('COS20001', 2);
SELECT add_unit_offering('COS20007', 1); SELECT add_unit_offering('COS20007', 2);
SELECT add_unit_offering('COS20019', 1); SELECT add_unit_offering('COS20019', 2);
SELECT add_unit_offering('COS20031', 1); SELECT add_unit_offering('COS20031', 2);
SELECT add_unit_offering('COS30015', 1); SELECT add_unit_offering('COS30015', 2);
SELECT add_unit_offering('COS30017', 1); SELECT add_unit_offering('COS30017', 2);
SELECT add_unit_offering('COS30019', 1); SELECT add_unit_offering('COS30019', 2);
SELECT add_unit_offering('COS30047', 1); SELECT add_unit_offering('COS30047', 2);
SELECT add_unit_offering('COS30049', 1); SELECT add_unit_offering('COS30049', 2);
SELECT add_unit_offering('COS40005', 1); SELECT add_unit_offering('COS40005', 2);
SELECT add_unit_offering('COS40006', 1); SELECT add_unit_offering('COS40006', 2);

SELECT add_unit_offering('ICT30005', 1); SELECT add_unit_offering('ICT30005', 2);
SELECT add_unit_offering('INF10024', 1); SELECT add_unit_offering('INF10024', 2);

SELECT add_unit_offering('MGT10010', 1); SELECT add_unit_offering('MGT10010', 2);
SELECT add_unit_offering('MPU3142', 1); SELECT add_unit_offering('MPU3142', 2);
SELECT add_unit_offering('MPU3143', 1); SELECT add_unit_offering('MPU3143', 2);
SELECT add_unit_offering('MPU3182', 1); SELECT add_unit_offering('MPU3182', 2);
SELECT add_unit_offering('MPU3183', 1); SELECT add_unit_offering('MPU3183', 2);
SELECT add_unit_offering('MPU3192', 1); SELECT add_unit_offering('MPU3192', 2);
SELECT add_unit_offering('MPU3193', 1); SELECT add_unit_offering('MPU3193', 2);
SELECT add_unit_offering('MPU3272', 1); SELECT add_unit_offering('MPU3272', 2);
SELECT add_unit_offering('MPU3273', 1); SELECT add_unit_offering('MPU3273', 2);
SELECT add_unit_offering('MPU3412', 1); SELECT add_unit_offering('MPU3412', 2);

SELECT add_unit_offering('SWE20001', 1); SELECT add_unit_offering('SWE20001', 2);
SELECT add_unit_offering('SWE30003', 1); SELECT add_unit_offering('SWE30003', 2);
SELECT add_unit_offering('SWE40001', 1); SELECT add_unit_offering('SWE40001', 2);
SELECT add_unit_offering('SWE40002', 1); SELECT add_unit_offering('SWE40002', 2);

SELECT add_unit_offering('TNE10006', 1); SELECT add_unit_offering('TNE10006', 2);


-- Units offered in both Summer and Winter Term
SELECT add_unit_offering('MPU3212', 3); SELECT add_unit_offering('MPU3212', 4);


SELECT add_unit_offering('ICT20016', 3); SELECT add_unit_offering('ICT20016', 4);
SELECT add_unit_offering('ICT20016', 2);

-- ======================================================================================================================
-- Deactivate the old units and link them to their replacements
-- ======================================================================================================================
UPDATE units
SET is_active = FALSE,
    replaced_by_unit_id = (SELECT id FROM units WHERE unit_code = 'MPU3142')
WHERE unit_code = 'MPU3143';

UPDATE units
SET is_active = FALSE,
    replaced_by_unit_id = (SELECT id FROM units WHERE unit_code = 'MPU3182')
WHERE unit_code = 'MPU3183';

UPDATE units
SET is_active = FALSE,
    replaced_by_unit_id = (SELECT id FROM units WHERE unit_code = 'MPU3192')
WHERE unit_code = 'MPU3193';

UPDATE units
SET is_active = FALSE,
    replaced_by_unit_id = (SELECT id FROM units WHERE unit_code = 'MPU3272')
WHERE unit_code = 'MPU3273';