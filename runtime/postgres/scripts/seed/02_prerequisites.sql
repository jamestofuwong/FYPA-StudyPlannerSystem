-- -- Seed file 02: Prerequisites of the Units

-- Single prereq
-- SELECT add_prereq_unit('', '');
SELECT add_prereq_unit('COS20007', 'COS10009');
SELECT add_prereq_unit('COS20015', 'COS10009');
SELECT add_prereq_unit('COS20030', 'TNE10006');

SELECT add_prereq_unit('COS30008', 'COS20007');
SELECT add_prereq_unit('COS30017', 'COS20007');
SELECT add_prereq_unit('COS30018', 'COS20007');
SELECT add_prereq_unit('COS30019', 'COS20007');
SELECT add_prereq_unit('COS30045', 'COS10009');
SELECT add_prereq_unit('COS30047', 'TNE30009');

SELECT add_prereq_unit('COS40006', 'COS40005');
SELECT add_prereq_unit('COS40003', 'COS20007');

SELECT add_prereq_unit('ICT30010','TNE10006');


SELECT add_prereq_unit('SWE20001', 'COS20007');
SELECT add_prereq_unit('SWE30009', 'COS20007');
SELECT add_prereq_unit('SWE40001', 'COS20007');
SELECT add_prereq_unit('SWE40002', 'SWE40001');

SELECT add_prereq_unit('TNE20002', 'TNE10006');
SELECT add_prereq_unit('TNE30009', 'TNE10006');
SELECT add_prereq_unit('TNE30012', 'TNE20002');



-- Credit point threshold
-- SELECT add_prereq_credits('', );
SELECT add_prereq_credits('COS20019', 50);
SELECT add_prereq_credits('COS40005', 175);

SELECT add_prereq_credits('ICT30005', 150);
SELECT add_prereq_credits('ICT30005', 200);



-- AND groups (all must be completed)
-- SELECT add_prereq_and_group('', ARRAY['', '']);
SELECT add_prereq_and_group('COS20028', ARRAY['COS10022', 'COS20007']);
SELECT add_prereq_and_group('COS20083', ARRAY['COS10022', 'COS10009']);
SELECT add_prereq_and_group('COS30015', ARRAY['COS10009', 'COS10026', 'TNE10006']);
SELECT add_prereq_and_group('COS30020', ARRAY['COS10009', 'COS10026']);
SELECT add_prereq_and_group('COS30043', ARRAY['COS10011', 'COS20007']);
SELECT add_prereq_and_group('COS30081', ARRAY['COS20015', 'COS30019']);

SELECT add_prereq_and_group('SWE30011', ARRAY['COS10011', 'COS20007']);


-- OR group (either one satisfies the req)
-- SELECT add_prereq_or('', ARRAY['', '']);
SELECT add_prereq_or('COS20031', ARRAY['COS10009', 'COS10026']);
SELECT add_prereq_or('COS30049', ARRAY['COS10009', 'COS10026']);
SELECT add_prereq_or('COS30082', ARRAY['COS30018', 'COS30019']);

SELECT add_prereq_or('SWE40006', ARRAY['COS20031', 'SWE30003']);


-- Mixed group
-- SELECT add_prereq_mixed_group('', ARRAY['credit_points', '', 'unit', '']);
SELECT add_prereq_mixed_group('COS40007', ARRAY['credit_points', '100', 'unit', 'COS10009']);

SELECT add_prereq_mixed_group('SWE30003', ARRAY['credit_points', '150', 'unit', 'COS20007']);

-- (100 Credit Points & INF10003/COS20007/SWE20004)
SELECT add_prereq_mixed_group('INF30020', ARRAY['credit_points', '100', 'unit', 'INF10003']);
SELECT add_prereq_mixed_group('INF30020', ARRAY['credit_points', '100', 'unit', 'COS20007']);
SELECT add_prereq_mixed_group('INF30020', ARRAY['credit_points', '100', 'unit', 'SWE20004']);

