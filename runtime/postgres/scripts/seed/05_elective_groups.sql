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