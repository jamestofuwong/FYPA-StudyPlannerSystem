-- -- Seed file 05: Elective Groups

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