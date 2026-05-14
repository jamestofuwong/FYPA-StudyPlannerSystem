-- Seed file 05: Elective Groups

-- ======================================================================================================================
-- 2025 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — March 2025
SELECT add_elective_group(
    'BA-CS',
    'Artificial Intelligence',
    2025::SMALLINT,
    3::SMALLINT,
    ARRAY[
        'COS30045',
        'COS20083',
        'COS30008',
        'COS30043',
        'COS30020',
        'INF10024',
        'COS10022',
        'COS10082',
        'COS20028'
    ]
);

-- BA-CS, Cybersecurity — March 2025
SELECT add_elective_group(
    'BA-CS',
    'Cybersecurity',
    2025::SMALLINT,
    3::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30047',
        'COS30045',
        'COS30020',
        'TNE10005',
        'COS30018',
        'INF10024',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Data Science — March 2025
SELECT add_elective_group(
    'BA-CS',
    'Data Science',
    2025::SMALLINT,
    3::SMALLINT,
    ARRAY[
        'COS20083',
        'COS10082',
        'COS30008',
        'COS30018',
        'INF10024',
        'COS30043',
        'COS30020',
        'COS30082'
    ]
);

-- BA-CS, Internet of Things — March 2025
SELECT add_elective_group(
    'BA-CS',
    'Internet of Things',
    2025::SMALLINT,
    3::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30045',
        'COS20030',
        'TNE30009',
        'COS30018',
        'INF10024',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Software Development — March 2025
SELECT add_elective_group(
    'BA-CS',
    'Software Development',
    2025::SMALLINT,
    3::SMALLINT,
    ARRAY[
        'COS30017',
        'COS30020',
        'COS20030',
        'COS30018',
        'INF10024',
        'SWE40006',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- ======================================================================================================================
-- 2024 - Semester 2 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — September 2025
SELECT add_elective_group(
    'BA-CS',
    'Artificial Intelligence',
    2024::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'INF10024',
        'COS30045',
        'COS30015',
        'COS20083',
        'COS30008',
        'COS30043',
        'COS30020',
        'COS10022',
        'COS10082',
        'COS20028'
    ]
);

-- BA-CS, Cybersecurity — September 2024
SELECT add_elective_group(
    'BA-CS',
    'Cybersecurity',
    2024::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'INF10024',
        'SWE30009',
        'COS30045',
        'COS30047',
        'COS30082',
        'COS30020',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Data Science — September 2024
SELECT add_elective_group(
    'BA-CS',
    'Data Science',
    2024::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'INF10024',
        'COS20083',
        'COS10082',
        'COS30008',
        'COS30018',
        'COS30043',
        'COS30015',
        'COS30020',
        'COS30082'
    ]
);

-- BA-CS, Internet of Things — September 2024
SELECT add_elective_group(
    'BA-CS',
    'Internet of Things',
    2024::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'INF10024',
        'SWE30009',
        'COS30045',
        'COS30015',
        'TNE30009',
        'COS30018',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Software Development — September 2024
SELECT add_elective_group(
    'BA-CS',
    'Software Development',
    2024::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'INF10024',
        'COS30017',
        'COS30020',
        'COS20030',
        'COS30018',
        'COS30082',
        'SWE40006',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- ======================================================================================================================
-- 2024 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — February 2024
SELECT add_elective_group(
    'BA-CS',
    'Artificial Intelligence',
    2024::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30045',
        'COS20083',
        'COS30008',
        'COS30043',
        'COS30020',
        'INF10024',
        'COS10022',
        'COS10082',
        'COS20028'
    ]
);

-- BA-CS, Cybersecurity — February 2024
SELECT add_elective_group(
    'BA-CS',
    'Cybersecurity',
    2024::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30045',
        'COS30020',
        'TNE10005',
        'COS30018',
        'INF10024',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Data Science — February 2024
SELECT add_elective_group(
    'BA-CS',
    'Data Science',
    2024::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS20083',
        'COS10082',
        'COS30008',
        'COS30018',
        'INF10024',
        'COS30043',
        'COS30020',
        'COS30082'
    ]
);

-- BA-CS, Internet of Things — February 2024
SELECT add_elective_group(
    'BA-CS',
    'Internet of Things',
    2024::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30045',
        'COS20030',
        'TNE30009',
        'COS30018',
        'INF10024',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Software Development — February 2024
SELECT add_elective_group(
    'BA-CS',
    'Software Development',
    2024::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30017',
        'COS30020',
        'COS20030',
        'COS30018',
        'INF10024',
        'SWE40006',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- ======================================================================================================================
-- 2023 - Semester 2 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — September 2023
SELECT add_elective_group(
    'BA-CS',
    'Artificial Intelligence',
    2023::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS30045',
        'COS20083',
        'COS30008',
        'COS30043',
        'COS30020',
        'COS20015',
        'COS10022',
        'COS10082',
        'COS20028'
    ]
);

-- BA-CS, Cybersecurity — September 2023
SELECT add_elective_group(
    'BA-CS',
    'Cybersecurity',
    2023::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30045',
        'COS30020',
        'TNE10005',
        'COS30018',
        'COS20015',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Data Science — September 2023
SELECT add_elective_group(
    'BA-CS',
    'Data Science',
    2023::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS20083',
        'COS10082',
        'COS30008',
        'COS30018',
        'COS20015',
        'COS30043',
        'COS30020',
        'COS30082'
    ]
);

-- BA-CS, Internet of Things — September 2023
SELECT add_elective_group(
    'BA-CS',
    'Internet of Things',
    2023::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30045',
        'COS20030',
        'TNE30009',
        'COS30018',
        'COS20015',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Software Development — September 2023
SELECT add_elective_group(
    'BA-CS',
    'Software Development',
    2023::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS30017',
        'COS30020',
        'COS20030',
        'COS30018',
        'COS20015',
        'SWE40006',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- ======================================================================================================================
-- 2023 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — February 2023
SELECT add_elective_group(
    'BA-CS',
    'Artificial Intelligence',
    2023::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30045',
        'COS20083',
        'COS30008',
        'COS30043',
        'COS30020',
        'COS20015',
        'COS10022',
        'COS10082',
        'COS20028'
    ]
);

-- BA-CS, Cybersecurity — February 2023
SELECT add_elective_group(
    'BA-CS',
    'Cybersecurity',
    2023::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30045',
        'COS30020',
        'TNE10005',
        'COS30018',
        'COS20015',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Data Science — February 2023
SELECT add_elective_group(
    'BA-CS',
    'Data Science',
    2023::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS20083',
        'COS10082',
        'COS30008',
        'COS30018',
        'COS20015',
        'COS30043',
        'COS30020',
        'COS30082'
    ]
);

-- BA-CS, Internet of Things — February 2023
SELECT add_elective_group(
    'BA-CS',
    'Internet of Things',
    2023::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'SWE30009',
        'COS30045',
        'COS20030',
        'TNE30009',
        'COS30018',
        'COS20015',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Software Development — February 2023
SELECT add_elective_group(
    'BA-CS',
    'Software Development',
    2023::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30017',
        'COS30020',
        'COS20030',
        'COS30018',
        'COS20015',
        'SWE40006',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- ======================================================================================================================
-- 2022 - Semester 2 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — September 2022
SELECT add_elective_group(
    'BA-CS',
    'Artificial Intelligence',
    2022::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS30043',
        'COS10004',
        'SWE30011',
        'COS20019',
        'COS30045',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Cybersecurity — September 2022
SELECT add_elective_group(
    'BA-CS',
    'Cybersecurity',
    2022::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS30047',
        'COS10004',
        'COS20030',
        'COS20019',
        'COS30019',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Data Science — September 2022
SELECT add_elective_group(
    'BA-CS',
    'Data Science',
    2022::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS30043',
        'COS10082',
        'COS20083',
        'COS20019',
        'COS30082'
    ]
);

-- BA-CS, Internet of Things — September 2022
SELECT add_elective_group(
    'BA-CS',
    'Internet of Things',
    2022::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS30047',
        'COS10004',
        'COS20030',
        'TNE30009',
        'COS30019',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Software Development — September 2022
SELECT add_elective_group(
    'BA-CS',
    'Software Development',
    2022::SMALLINT,
    9::SMALLINT,
    ARRAY[
        'COS30043',
        'COS10004',
        'COS20030',
        'COS20019',
        'COS30019',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- ======================================================================================================================
-- 2022 - Semester 1 Intake
-- ======================================================================================================================
-- BA-CS, Artificial Intelligence — February 2022
SELECT add_elective_group(
    'BA-CS',
    'Artificial Intelligence',
    2022::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30043',
        'COS10004',
        'SWE30011',
        'COS20019',
        'COS30045',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Cybersecurity — February 2022
SELECT add_elective_group(
    'BA-CS',
    'Cybersecurity',
    2022::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30047',
        'COS10004',
        'COS20030',
        'COS20019',
        'COS30019',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Data Science — February 2022
SELECT add_elective_group(
    'BA-CS',
    'Data Science',
    2022::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30043',
        'COS10082',
        'COS20083',
        'COS20019',
        'COS30082'
    ]
);

-- BA-CS, Internet of Things — February 2022
SELECT add_elective_group(
    'BA-CS',
    'Internet of Things',
    2022::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30047',
        'COS10004',
        'COS20030',
        'TNE30009',
        'COS30019',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- BA-CS, Software Development — February 2022
SELECT add_elective_group(
    'BA-CS',
    'Software Development',
    2022::SMALLINT,
    2::SMALLINT,
    ARRAY[
        'COS30043',
        'COS10004',
        'COS20030',
        'COS20019',
        'COS30019',
        'COS10022',
        'COS10082',
        'COS20083',
        'COS20028'
    ]
);

-- Add Big Data Analytics minor to ALL BA-CS planners that have elective groups (except Data Science)
DO $$
DECLARE
    v_major_name VARCHAR;
    v_template_id UUID;
    v_minor_id UUID;
    v_unit_codes VARCHAR[] := ARRAY['COS10022', 'COS10082', 'COS20083', 'COS20028'];
    v_unit_code VARCHAR;
    v_unit_id UUID;
BEGIN
    FOR v_template_id IN
        SELECT pt.id
        FROM planner_templates pt
        JOIN courses c ON c.id = pt.course_id
        LEFT JOIN majors m ON m.id = pt.major_id
        WHERE c.code = 'BA-CS'
          AND (m.name IS NULL OR m.name <> 'Data Science')
          AND EXISTS(
              SELECT 1 FROM template_units tu
              WHERE tu.planner_template_id = pt.id AND tu.category = 'elective'
          )
    LOOP
        INSERT INTO minors (planner_template_id, name)
        VALUES (v_template_id, 'Big Data Analytics')
        RETURNING id INTO v_minor_id;
        
        FOREACH v_unit_code IN ARRAY v_unit_codes LOOP
            SELECT id INTO STRICT v_unit_id FROM units WHERE unit_code = v_unit_code;
            INSERT INTO minor_units (minor_id, unit_id)
            VALUES (v_minor_id, v_unit_id);
        END LOOP;
    END LOOP;
END;
$$;