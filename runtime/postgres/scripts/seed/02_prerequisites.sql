-- -- Seed file 02: Prerequisites of the Units

-- Single prereq
SELECT add_prereq_unit('COS20007',  'COS10009');
SELECT add_prereq_unit('COS20015',  'COS10009');
SELECT add_prereq_unit('COS30045',  'COS10009');

SELECT add_prereq_unit('COS30008',  'COS20007');
SELECT add_prereq_unit('COS30019',  'COS20007');
SELECT add_prereq_unit('COS30018',  'COS20007');
SELECT add_prereq_unit('SWE20001',  'COS20007');
SELECT add_prereq_unit('SWE40001',  'COS20007');

SELECT add_prereq_unit('SWE40002', 'SWE40001');

-- Credit point threshold
SELECT add_prereq_credits('ICT30005', 200);


-- AND groups (all must be completed)
SELECT add_prereq_and_group('COS30081', ARRAY['COS20015', 'COS30019']);
SELECT add_prereq_and_group('COS30043', ARRAY['COS10011', 'COS20007']);
SELECT add_prereq_and_group('SWE30011', ARRAY['COS10011', 'COS20007']);
SELECT add_prereq_and_group('COS20019', ARRAY['COS10011', 'TNE10006']);
SELECT add_prereq_and_group('COS20083', ARRAY['COS10022', 'COS10009']);
SELECT add_prereq_and_group('COS20028', ARRAY['COS10022', 'COS20007']);

-- OR group (either one satisfies the req)
SELECT add_prereq_or('COS30082', ARRAY['COS30018', 'COS30019']);


