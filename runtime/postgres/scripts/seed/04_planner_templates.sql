-- -- Seed file 04: Planner Templates + Template Units

-- core, major_core, prescribed_elective, elective, wil, mpu     

-- 1 = Semester 1
-- 2 = Semester 2
-- 3 = Summer Term
-- 4 = Winter Term

-- ======================================================================================================================
-- 2026 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — March 2026
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2026::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'elective', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'COS10004', 'core', '2', '1',
        'COS30018', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'SWE30003', 'major_core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30082', 'major_core', '2', '2',
        'COS30008', 'elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '3', --summer term

        'COS40005 ', 'core', '3', '1',
        'COS20019', 'major_core', '3', '1',
        'COS40007', 'major_core', '3', '1',

        'COS40006', 'core', '3', '2',
        'MGT10010', 'elective', '3', '2',
        'COS30015', 'elective', '3', '2'
    ]);
END;
$$;

-- BA-CS, Cybersecurity — March 2026
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2026::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'TNE20003', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30015', 'major_core', '2', '1',
        'COS10022', 'elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'TNE30009', 'major_core', '2', '2',
        'COS30019', 'prescribed_elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '3', --summer term

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS30047', 'elective', '3', '1',

        'COS40006', 'core', '3', '2',
        'COS20030', 'major_core', '3', '2',
        'MGT10010', 'elective', '3', '2'
    ]);
END;
$$;

-- BA-CS, Data Science — March 2026
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2026::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'major_core', '1', '2',
        'COS10082', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'COS20031', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'COS20083', 'elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30045', 'major_core', '2', '2',
        'MGT10010', 'elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '3', --summer term

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'SWE40006', 'major_core', '3', '1',

        'COS40006', 'core', '3', '2',
        'COS20028', 'major_core', '3', '2',
        'COS30015', 'elective', '3', '2'
    ]);
END;
$$;

-- BA-CS, Internet of Things — March 2026
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2026::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'TNE10005', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'SWE30011', 'major_core', '2', '1',
        'COS10022', 'elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30017', 'major_core', '2', '2',
        'COS30015', 'elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '3', --summer term

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS30019', 'prescribed_elective', '3', '1',

        'COS40006', 'core', '3', '2',
        'COS30020', 'major_core', '3', '2',
        'MGT10010', 'elective', '3', '2'
    ]);
END;
$$;

-- BA-CS, Software Development — March 2026
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2026::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'COS30043', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'COS10022', 'elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30008', 'major_core', '2', '2',
        'SWE30009', 'major_core', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '3', --summer term

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'SWE40006', 'elective', '3', '1',

        'COS40006', 'core', '3', '2',
        'COS40003', 'major_core', '3', '2',
        'COS30015', 'elective', '3', '2'
    ]);
END;
$$;

-- ======================================================================================================================
-- 2025 - Semester 2 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — September 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2025::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'elective', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20031', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS30015', 'elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30018', 'major_core', '2', '2',
        'MGT10010', 'elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS30082', 'major_core', '3', '1',
        'COS30008', 'elective', '3', '1',

        'COS40006', 'core', '3', '2',
        'COS40007', 'major_core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
    ]);
END;
$$;

-- BA-CS, Cybersecurity — September 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2025::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'TNE20003', 'major_core', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20030', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30015', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        'COS10022', 'elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'TNE30009', 'major_core', '3', '1',
        'SWE30003', 'major_core', '3', '1',

        'COS40006', 'core', '3', '2',
        'MGT10010', 'elective', '3', '2',
        'COS30047', 'elective', '3', '2'
    ]);
END;
$$;

-- BA-CS, Data Science — September 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2025::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'MGT10010', 'elective', '1', '2',
        'COS10022', 'major_core', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20031', 'major_core', '2', '1',
        'COS30045', 'major_core', '2', '1',
        'COS10082', 'elective', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        'COS20083', 'elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS20028', 'major_core', '3', '1',
        'SWE30003', 'major_core', '3', '1',

        'COS40006', 'core', '3', '2',
        'SWE40006', 'major_core', '3', '2',
        'COS30015', 'elective', '3', '2'
    ]);
END;
$$;

-- BA-CS, Internet of Things — September 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2025::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'TNE10005', 'major_core', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS30020', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'COS10022', 'elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30017', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        'SWE30011', 'major_core', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS30049', 'major_core', '3', '1',
        'SWE30003', 'major_core', '3', '1',

        'COS40006', 'core', '3', '2',
        'COS30015', 'elective', '3', '2',
        'MGT10010', 'elective', '3', '2'
    ]);
END;
$$;

-- BA-CS, Software Development — September 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2025::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3272', 'mpu', '1', '1',

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        'INF10024', 'elective', '1', '2',
        'MPU3192', 'mpu', '1', '2',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20031', 'major_core', '2', '1',
        'SWE30009', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'COS30015', 'elective', '2', '1',
        'MPU3182', 'mpu', '2', '1',
        'MPU3142', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30043', 'major_core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS10022', 'elective', '2', '2',
        'MPU3412', 'mpu', '2', '2',

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS40003', 'major_core', '3', '1',
        'COS30008', 'major_core', '3', '1',

        'COS40006', 'core', '3', '2',
        'SWE30003', 'major_core', '3', '2',
        'SWE40006', 'elective', '3', '2'
    ]);
END;
$$;

-- ======================================================================================================================
-- 2025 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — March 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2025::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS30018', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30082', 'major_core', '2', '2',
        -- E2
        'ICT20016', 'wil', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS40007', 'major_core', '3', '1',
        
        'COS40006', 'core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 2,   -- elective 2 (Y2 S2)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Cybersecurity — March 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2025::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'TNE20003', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30015', 'major_core', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'TNE30009', 'major_core', '2', '2',
        'COS30019', 'prescribed_elective', '2', '2',
        'ICT20016', 'wil', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        -- E3
        
        'COS40006', 'core', '3', '2',
        'COS20030', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        3, 1,   -- elective 3 (Y3 S1)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Data Science — March 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2025::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS20031', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30045', 'major_core', '2', '2',
        -- E3
        'ICT20016', 'wil', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'SWE40006', 'major_core', '3', '1',
        
        'COS40006', 'core', '3', '2',
        'COS20028', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Internet of Things — March 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2025::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'TNE10005', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'SWE30011', 'major_core', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30017', 'major_core', '2', '2',
        -- E3
        'ICT20016', 'wil', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS30019', 'prescribed_elective', '3', '1',
        
        'COS40006', 'core', '3', '2',
        'COS30020', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Software Development — March 2025
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2025::SMALLINT, 3::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS30043', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30008', 'major_core', '2', '2',
        'SWE30009', 'major_core', '2', '2',
        'ICT20016', 'wil', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        -- E3
        
        'COS40006', 'core', '3', '2',
        'COS40003', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        3, 1,   -- elective 3 (Y3 S1)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- ======================================================================================================================
-- 2024 - Semester 2 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — September 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2024::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS20031', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30018', 'major_core', '2', '2',
        -- E3

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS30082', 'major_core', '3', '1',
        -- E4
        
        'COS40006', 'core', '3', '2',
        'COS40007', 'major_core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        3, 1    -- elective 4 (Y3 S1)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Cybersecurity — September 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2024::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'TNE20003', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS20030', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30015', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        -- E2

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'TNE30009', 'major_core', '3', '1',
        -- E3
        
        'COS40006', 'core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 2,   -- elective 2 (Y2 S2)
        3, 1,   -- elective 3 (Y3 S1)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Data Science — September 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2024::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        -- E1
        'COS10022', 'major_core', '1', '2',
        'MPU3193', 'mpu', '1', '2',

        'COS20031', 'major_core', '2', '1',
        'COS30045', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        'SWE30003', 'major_core', '2', '2',

        'ICT20016', 'wil', '2', '4',  --winter term

        'COS40005', 'core', '3', '1',
        'COS20028', 'major_core', '3', '1',
        -- E3
        
        'COS40006', 'core', '3', '2',
        'SWE40006', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        3, 1,   -- elective 3 (Y3 S1)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Internet of Things — September 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2024::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'TNE10005', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS30020', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30017', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        'SWE30011', 'major_core', '2', '2',

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        -- E3
        'COS30049 ', 'major_core', '3', '1',
        
        'COS40006', 'core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        3, 1,   -- elective 3 (Y3 S1)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Software Development — September 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2024::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS20019', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS20031', 'major_core', '2', '1',
        'SWE30009', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E2
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30043', 'major_core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        -- E3

        'ICT20016', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS40003', 'major_core', '3', '1',
        'COS30008', 'major_core', '3', '1',
        
        'COS40006', 'core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- ======================================================================================================================
-- 2024 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — February 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2024::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS30018', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'SWE30009', 'prescribed_elective', '2', '2',
        'COS30015', 'prescribed_elective', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS40007', 'major_core', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS30082', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Cybersecurity — February 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2024::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'TNE20003', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30015', 'major_core', '2', '1',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'TNE30009', 'major_core', '2', '2',
        'COS30019', 'prescribed_elective', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS30047', 'prescribed_elective', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS20030', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Data Science — February 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2024::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'major_core', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS20031', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'COS30015', 'prescribed_elective', '2', '1',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30045', 'major_core', '2', '2',
        'SWE30009', 'prescribed_elective', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'SWE40006', 'major_core', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS20028', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Internet of Things — February 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2024::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'TNE10005', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'SWE30011', 'major_core', '2', '1',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30017', 'major_core', '2', '2',
        'COS30015', 'prescribed_elective', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS30019', 'prescribed_elective', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS30020', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Software Development — February 2024
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2024::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'COS10025', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3273', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'TNE10006', 'core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        -- E1
        'MPU3193', 'mpu', '1', '2',

        'COS30043', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30008', 'major_core', '2', '2',
        'SWE30009', 'major_core', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS30015', 'prescribed_elective', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS40003', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- ======================================================================================================================
-- 2023 - Semester 2 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — September 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2023::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS20031', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'SWE30009', 'prescribed_elective', '2', '1',
        -- E1
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30018', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',

        'ICT20016*Optional', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS30082', 'major_core', '3', '1',
        -- E2
        -- E3
        
        'COS40006', 'core', '3', '2',
        'COS40007', 'major_core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        2, 1,   -- elective 1 (Y2 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 1,   -- elective 3 (Y3 S1)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Cybersecurity — September 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2023::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'major_core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS20030', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E1
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'TNE20003', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',

        'ICT20016*Optional', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'TNE30009', 'major_core', '3', '1',
        'COS30047', 'prescribed_elective', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        2, 1,   -- elective 1 (Y2 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Data Science — September 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2023::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'major_core', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS20031', 'major_core', '2', '1',
        'COS30045', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E1
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        'SWE30003', 'major_core', '2', '2',

        'ICT20016*Optional', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS20028', 'major_core', '3', '1',
        'SWE30009', 'prescribed_elective', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'SWE40006', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        2, 1,   -- elective 1 (Y2 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Internet of Things — September 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2023::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS30020', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E1
        
        'TNE10005', 'major_core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        'SWE30011', 'major_core', '2', '2',

        'ICT20016*Optional', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS10004', 'core', '3', '1',
        'COS30017', 'major_core', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        2, 1,   -- elective 1 (Y2 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Software Development — September 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2023::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '3', --summer term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS20031', 'major_core', '2', '1',
        'COS30008', 'major_core', '2', '1',
        'SWE30009', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        
        'COS10004', 'core', '2', '2',
        'COS30043', 'major_core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',

        'ICT20016*Optional', 'wil', '2', '4', --winter term

        'COS40005', 'core', '3', '1',
        'COS40003', 'major_core', '3', '1',
        -- E1
        -- E2
        
        'COS40006', 'core', '3', '2',
        'SWE30003', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        3, 1,   -- elective 1 (Y3 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- ======================================================================================================================
-- 2023 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — February 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2023::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS30018', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'SWE30009', 'elective', '2', '2',
        -- E1

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'COS40007', 'major_core', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS30082', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        2, 2,   -- elective 1 (Y2 S2)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Cybersecurity — February 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2023::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'major_core', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'TNE20003', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'TNE30009', 'major_core', '2', '2',
        -- E1

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        -- E2
        -- E3
        
        'COS40006', 'core', '3', '2',
        'COS20030', 'major_core', '3', '2',
        'COS30047', 'prescribed_elective', '3', '2'
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        2, 2,   -- elective 1 (Y2 S2)
        3, 1,   -- elective 2 (Y3 S1)
        3, 1,   -- elective 3 (Y3 S1)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Data Science — February 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2023::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'major_core', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS20031', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        -- E1
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30045', 'major_core', '2', '2',
        'SWE30009', 'prescribed_elective', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        'SWE40006', 'major_core', '3', '1',
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS20028', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        2, 1,   -- elective 1 (Y2 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Internet of Things — February 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2023::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'TNE10005', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'SWE30011', 'major_core', '2', '1',
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30017', 'major_core', '2', '2',
        'COS30019', 'prescribed_elective', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        -- E1
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS30020', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        3, 1,   -- elective 1 (Y3 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Software Development — February 2023
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2023::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10026', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',
        'COS10003', 'prescribed_elective', '1', '1',
        'MPU3193', 'mpu', '1', '1',

        'MPU3212', 'mpu', '1', '4', --winter term

        'COS20007', 'core', '1', '2',
        'COS10025', 'core', '1', '2',
        'COS30015', 'prescribed_elective', '1', '2',
        'COS10022', 'prescribed_elective', '1', '2',
        'MPU3183', 'mpu', '2', '1',
        'MPU3143', 'mpu', '2', '1',

        'COS30043', 'major_core', '2', '1',
        'COS20019', 'major_core', '2', '1',
        'COS20031', 'major_core', '2', '1',
        'COS30019', 'prescribed_elective', '2', '1',
        
        'COS10004', 'core', '2', '2',
        'COS30049', 'major_core', '2', '2',
        'COS30008', 'major_core', '2', '2',
        'SWE30009', 'major_core', '2', '2',

        'COS40005', 'core', '3', '1',
        'SWE30003', 'major_core', '3', '1',
        -- E1
        -- E2
        
        'COS40006', 'core', '3', '2',
        'COS40003', 'major_core', '3', '2'
        -- E3
        -- E4
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        3, 1,   -- elective 1 (Y3 S1)
        3, 1,   -- elective 2 (Y3 S1)
        3, 2,   -- elective 3 (Y3 S2)
        3, 2    -- elective 4 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- ======================================================================================================================
-- 2022 - Semester 2 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — September 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2022::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'COS20001', 'major_core', '1', '2',
        'COS20015', 'core', '1', '2',
        -- E1

        'COS30008', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        -- E2
        -- E3

        'COS30018', 'major_core', '2', '2',
        'SWE20001', 'major_core', '2', '2',
        'COS30081', 'major_core', '2', '2',
        -- E4

        'SWE40001', 'core', '3', '1',
        'COS30082', 'major_core', '3', '1',
        -- E5
        -- E6

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 1,   -- elective 3 (Y2 S1)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 1,   -- elective 6 (Y3 S1)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Cybersecurity — September 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2022::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'TNE20002', 'major_core', '1', '2',
        'COS20015', 'core', '1', '2',
        -- E1

        'COS30015', 'major_core', '2', '1',
        'SWE20001', 'major_core', '2', '1',
        'TNE30009', 'major_core', '2', '1',
        -- E2

        'ICT30010', 'major_core', '2', '2',
        'TNE30012', 'major_core', '2', '2',
        -- E3
        -- E4

        'SWE40001', 'core', '3', '1',
        'INF30020', 'major_core', '3', '1',
        -- E5
        -- E6

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 1,   -- elective 6 (Y3 S1)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Data Science — September 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2022::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'STA10003', 'major_core', '1', '2',
        'COS20015', 'core', '1', '2',
        -- E1

        'COS30008', 'major_core', '2', '1',
        'COS30045', 'major_core', '2', '1',
        'COS10022', 'major_core', '2', '1',
        -- E2

        'SWE20001', 'major_core', '2', '2',
        'COS30019', 'major_core', '2', '2',
        -- E3
        -- E4

        'SWE40001', 'core', '3', '1',
        'COS20028', 'major_core', '3', '1',
        -- E5
        -- E6

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 1,   -- elective 6 (Y3 S1)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Internet of Things — September 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2022::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'STA10003', 'major_core', '1', '2',
        'COS20015', 'core', '1', '2',
        -- E1

        'COS30017', 'major_core', '2', '1',
        'SWE20001', 'major_core', '2', '1',
        'COS30015', 'major_core', '2', '1',
        -- E2

        'SWE30011', 'major_core', '2', '2',
        'COS20019', 'major_core', '2', '2',
        -- E3
        -- E4

        'SWE40001', 'core', '3', '1',
        'SWE30012', 'major_core', '3', '1',
        -- E5
        -- E6

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 1,   -- elective 6 (Y3 S1)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Software Development — September 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2022::SMALLINT, 9::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'COS20001', 'major_core', '1', '2',
        'COS20015', 'core', '1', '2',
        -- E1

        'COS30008', 'major_core', '2', '1',
        'SWE20001', 'major_core', '2', '1',
        'SWE30009', 'major_core', '2', '1',
        -- E2

        'SWE30011', 'major_core', '2', '2',
        'COS30017', 'major_core', '2', '2',
        -- E3
        -- E4

        'SWE40001', 'core', '3', '1',
        'COS30041', 'major_core', '3', '1',
        -- E5
        -- E6

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        2, 1,   -- elective 2 (Y2 S1)
        2, 2,   -- elective 3 (Y2 S2)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 1,   -- elective 6 (Y3 S1)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- ======================================================================================================================
-- 2022 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — February 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Artificial Intelligence', 2022::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'COS20001', 'major_core', '1', '2',
        -- E1
        -- E2

        'COS30018', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'COS20015', 'core', '2', '1',
        -- E3

        'COS30008', 'major_core', '2', '2',
        'SWE20001', 'major_core', '2', '2',
        'COS30082', 'major_core', '2', '2',
        -- E4

        'SWE40001', 'core', '3', '1',
        'COS30081', 'major_core', '3', '1',
        -- E5
        -- E6

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        1, 2,   -- elective 2 (Y1 S2)
        2, 1,   -- elective 3 (Y2 S1)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 1,   -- elective 6 (Y3 S1)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Cybersecurity — February 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Cybersecurity', 2022::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'COS30015', 'major_core', '1', '2',
        -- E1
        -- E2

        'TNE20002', 'major_core', '2', '1',
        'ICT30010', 'major_core', '2', '1',
        'COS20015', 'core', '2', '1',
        -- E3

        'INF30020', 'major_core', '2', '2',
        'SWE20001', 'major_core', '2', '2',
        'TNE30009', 'major_core', '2', '2',
        -- E4

        'SWE40001', 'core', '3', '1',
        'TNE30012', 'major_core', '3', '1',
        -- E5
        -- E6

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        1, 2,   -- elective 2 (Y1 S2)
        2, 1,   -- elective 3 (Y2 S1)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 1,   -- elective 6 (Y3 S1)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Data Science — February 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Data Science', 2022::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'COS10022', 'major_core', '1', '2',
        -- E1
        -- E2

        'STA10003', 'major_core', '2', '1',
        'SWE20001', 'major_core', '2', '1',
        'COS20015', 'core', '2', '1',
        -- E3

        'COS30008', 'major_core', '2', '2',
        'COS20028', 'major_core', '2', '2',
        'COS30045', 'major_core', '2', '2',
        -- E4

        'SWE40001', 'core', '3', '1',
        'ICT30005', 'core', '3', '1',
        'COS30019', 'major_core', '3', '1',
        -- E5

        'SWE40002', 'core', '3', '2'
        -- E6
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        1, 2,   -- elective 2 (Y1 S2)
        2, 1,   -- elective 3 (Y2 S1)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 2,   -- elective 6 (Y3 S2)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Internet of Things — February 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Internet of Things', 2022::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'COS30015', 'major_core', '1', '2',
        -- E1
        -- E2

        'STA10003', 'major_core', '2', '1',
        'SWE30011', 'major_core', '2', '1',
        'COS20015', 'core', '2', '1',
        -- E3

        'COS30017', 'major_core', '2', '2',
        'SWE20001', 'major_core', '2', '2',
        -- E4
        -- E5

        'SWE40001', 'core', '3', '1',
        'COS20019', 'major_core', '3', '1',
        -- E6
        -- E7

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2',
        'SWE30012', 'major_core', '3', '2'
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        1, 2,   -- elective 2 (Y1 S2)
        2, 1,   -- elective 3 (Y2 S1)
        2, 2,   -- elective 4 (Y2 S2)
        2, 2,   -- elective 5 (Y2 S2)
        3, 1,   -- elective 6 (Y3 S1)
        3, 1,   -- elective 7 (Y3 S1)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;

-- BA-CS, Software Development — February 2022
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    v_template_id := create_planner_template('BA-CS', 'Software Development', 2022::SMALLINT, 2::SMALLINT);

    PERFORM add_template_units(v_template_id, ARRAY[
        -- code, category, year, sem
        'COS10009', 'core', '1', '1',
        'COS10011', 'core', '1', '1',
        'COS10003', 'core', '1', '1',
        'TNE10006', 'core', '1', '1',

        'COS20007', 'major_core', '1', '2',
        'COS20001', 'major_core', '1', '2',
        -- E1
        -- E2

        'COS30017', 'major_core', '2', '1',
        'SWE20001', 'major_core', '2', '1',
        'COS20015', 'core', '2', '1',
        -- E3

        'COS30008', 'major_core', '2', '2',
        'COS30041', 'major_core', '2', '2',
        'SWE30009', 'major_core', '2', '2',
        -- E4

        'SWE40001', 'core', '3', '1',
        'ICT30005', 'core', '3', '1',
        'SWE30011', 'major_core', '3', '1',
        -- E5

        'SWE40002', 'core', '3', '2'
        -- E6
        -- E7
        -- E8
    ]);

    PERFORM add_elective_slots(v_template_id, ARRAY[
        1, 2,   -- elective 1 (Y1 S2)
        1, 2,   -- elective 2 (Y1 S2)
        2, 1,   -- elective 3 (Y2 S1)
        2, 2,   -- elective 4 (Y2 S2)
        3, 1,   -- elective 5 (Y3 S1)
        3, 2,   -- elective 6 (Y3 S2)
        3, 2,   -- elective 7 (Y3 S2)
        3, 2    -- elective 8 (Y3 S2)
    ]::SMALLINT[]);
END;
$$;