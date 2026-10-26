-- Data problems that the integration tests found in the seed data, fixed for new installs (the seed files) and for
-- existing installs (this migration), plus the loader change that would have caught the second one.
--
-- 1. SWE30011 (IoT Programming) and COS30015 (IT Security) accepted only COS10011 (SWE30011) or only COS10026 (COS30015)
--    as the first-year web unit. The planners use COS10011 up to 2022 and COS10026 after that, and COS10011 is an
--    antirequisite of COS10026, so no plan could place SWE30011 in a 2023 or later planner, or COS30015 in a 2022 one. A planner
--    cannot place a unit before its prerequisite, so the planners themselves show that either web unit is accepted. Each of the
--    two units now has two requisite groups (a unit is allowed when any group is met): one with COS10026, one with COS10011.
--
-- 2. The Internet of Things September 2024 planner lost COS30049 (Y3 S1, major core): the seed file wrote the code with a
--    trailing space ('COS30049 '), and add_template_units skipped a code that matched no unit without a word. The planner
--    said 8 major units and listed 7.
--
-- 3. add_template_units now stops with an error when a code matches no unit. A typo in a seed file fails the first start
--    loudly, in the tests, and not quietly in front of an advisor. Only the seed uses this function.
--
-- Each statement is safe to run again and does nothing when the data is already right.

-- 1. requisite groups with either web unit
DO $$
DECLARE
    r RECORD;
    v_target UUID;
    v_group UUID;
    v_code TEXT;
    v_unit UUID;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('SWE30011', ARRAY['COS10026', 'COS20007']),
        ('SWE30011', ARRAY['COS10011', 'COS20007']),
        ('COS30015', ARRAY['COS10009', 'COS10026', 'TNE10006']),
        ('COS30015', ARRAY['COS10009', 'COS10011', 'TNE10006'])
    ) AS t(target, codes)
    LOOP
        SELECT id INTO v_target FROM units WHERE unit_code = r.target;
        CONTINUE WHEN v_target IS NULL;
        -- skip a group that this unit already has with exactly these units
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM unit_requisite_groups g
            WHERE g.unit_id = v_target
              AND (SELECT array_agg(u.unit_code::text ORDER BY u.unit_code)
                     FROM unit_requisite_conditions c JOIN units u ON u.id = c.unit_id
                    WHERE c.group_id = g.id AND c.type = 'unit') = (SELECT array_agg(x ORDER BY x) FROM unnest(r.codes) x)
        );
        -- a unit that is not in this database (an old install) cannot be a prerequisite
        CONTINUE WHEN EXISTS (SELECT 1 FROM unnest(r.codes) x WHERE NOT EXISTS (SELECT 1 FROM units WHERE unit_code = x));
        INSERT INTO unit_requisite_groups (unit_id) VALUES (v_target) RETURNING id INTO v_group;
        FOREACH v_code IN ARRAY r.codes LOOP
            SELECT id INTO v_unit FROM units WHERE unit_code = v_code;
            INSERT INTO unit_requisite_conditions (group_id, type, unit_id, requisite_type) VALUES (v_group, 'unit', v_unit, 'prerequisite');
        END LOOP;
    END LOOP;
END;
$$;

-- 2. COS30049 in the Internet of Things September 2024 planner
INSERT INTO template_units (planner_template_id, unit_id, category, year_level, semester)
SELECT pt.id, u.id, 'major_core', 3, 1
FROM planner_templates pt
JOIN majors m ON m.id = pt.major_id AND m.name = 'Internet of Things'
JOIN units u ON u.unit_code = 'COS30049'
WHERE pt.intake_year = 2024 AND pt.intake_month = 9
  AND NOT EXISTS (SELECT 1 FROM template_units t WHERE t.planner_template_id = pt.id AND t.unit_id = u.id);

-- 3. the strict loader
CREATE OR REPLACE FUNCTION add_template_units(
    p_template_id UUID, p_units VARCHAR[]
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i INT := 1;
BEGIN
    WHILE i < array_length(p_units, 1) LOOP
        INSERT INTO template_units (planner_template_id, unit_id, category, year_level, semester)
        SELECT p_template_id, u.id, p_units[i + 1]::unit_category, p_units[i + 2]::SMALLINT, p_units[i + 3]::SMALLINT
        FROM units u WHERE u.unit_code = p_units[i];
        IF NOT FOUND THEN
            RAISE EXCEPTION 'add_template_units: no unit has the code "%" (check for a typo or a space)', p_units[i];
        END IF;
        i := i + 4;
    END LOOP;
END;
$$;
