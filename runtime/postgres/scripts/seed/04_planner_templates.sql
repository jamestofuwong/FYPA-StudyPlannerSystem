-- -- Seed file 04: Planner Templates + Template Units

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

        'COS30008', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',

        'COS30018', 'major_core', '2', '2',
        'SWE20001', 'major_core', '2', '2',
        'COS30081', 'major_core', '2', '2',

        'SWE40001', 'core', '3', '1',
        'COS30082', 'major_core', '3', '1',

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
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

        'COS30008', 'major_core', '2', '1',
        'COS30019', 'major_core', '2', '1',
        'COS20015', 'core', '2', '1',

        'COS30018', 'major_core', '2', '2',
        'SWE20001', 'major_core', '2', '2',
        'COS30081', 'major_core', '2', '2',

        'SWE40001', 'core', '3', '1',
        'COS30082', 'major_core', '3', '1',

        'SWE40002', 'core', '3', '2',
        'ICT30005', 'core', '3', '2'
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
