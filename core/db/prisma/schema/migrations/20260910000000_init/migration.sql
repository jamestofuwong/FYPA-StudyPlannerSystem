-- core/db/prisma/migrations/0_init/migration.sql

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Configuration & Default Inserts
CREATE TABLE system_config (
    key         VARCHAR(100)  PRIMARY KEY,
    value       TEXT          NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO system_config (key, value, description) VALUES
    ('second_major_threshold',        '70',   'Minimum match percentage (%) to qualify as a second major (REQ-FUN-610)'),
    ('planner_fallback_latest',       'false','If true, fall back to most recent planner version when intake year has no exact match (REQ-FUN-608)'),
    ('privacy_notice_version',        '1',    'Increment to force re-acknowledgement of the privacy notice (REQ-PRI-103)'),
    ('app_password_hash',             '',     'bcrypt hash of the application access password (REQ-SEC-203)'),
    ('security_incident_log_enabled', 'true', 'Enable security incident logging (REQ-BRE-101)');

-- 3. Core Tables
CREATE TABLE courses (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    code             VARCHAR(50)   UNIQUE,
    name             VARCHAR(255)  NOT NULL,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_courses_code ON courses(code);

CREATE TABLE majors (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id   UUID          NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    name        VARCHAR(255)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (course_id, name)
);
CREATE INDEX idx_majors_course ON majors(course_id);

CREATE TABLE units (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code     VARCHAR(20)   NOT NULL UNIQUE,
    unit_name     VARCHAR(255)  NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_units_code ON units(unit_code);

CREATE TABLE unit_offerings (
    unit_id     UUID          NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    offered_in  SMALLINT      NOT NULL CHECK (offered_in BETWEEN 1 AND 4),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (unit_id, offered_in)
);
CREATE INDEX idx_unit_offerings_term ON unit_offerings(offered_in);

CREATE TABLE unit_requisite_groups (
    id       UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id  UUID  NOT NULL REFERENCES units(id) ON DELETE CASCADE
);
CREATE INDEX idx_requisite_group_unit ON unit_requisite_groups(unit_id);

CREATE TABLE unit_requisite_conditions (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id            UUID         NOT NULL REFERENCES unit_requisite_groups(id) ON DELETE CASCADE,
    type                VARCHAR(20)  NOT NULL CHECK (type IN ('unit', 'credit_points')),
    unit_id             UUID         NULL REFERENCES units(id) ON DELETE CASCADE,
    credit_points       NUMERIC(5,1) NULL,
    requisite_type      VARCHAR(20)  NULL CHECK (requisite_type IN ('prerequisite', 'corequisite', 'antirequisite')),
    CONSTRAINT valid_condition CHECK (
        (type = 'unit' AND unit_id IS NOT NULL AND credit_points IS NULL AND requisite_type IS NOT NULL) OR
        (type = 'credit_points' AND credit_points IS NOT NULL AND unit_id IS NULL AND requisite_type IS NULL)
    )
);
CREATE INDEX idx_requisite_cond_group ON unit_requisite_conditions(group_id);
CREATE INDEX idx_requisite_cond_unit  ON unit_requisite_conditions(unit_id);

CREATE TABLE planner_templates (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID          NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    major_id            UUID          NULL     REFERENCES majors(id)  ON DELETE RESTRICT,
    intake_year         SMALLINT      NOT NULL,
    intake_month        SMALLINT      NULL CHECK (intake_month BETWEEN 1 AND 12),
    course_type         VARCHAR(50)   NOT NULL DEFAULT 'bachelor',
    duration_semesters  SMALLINT      NOT NULL DEFAULT 6,
    core_count          SMALLINT      NULL,
    core_cp             SMALLINT      NULL,
    major_count         SMALLINT      NULL,
    major_cp            SMALLINT      NULL,
    elective_count      SMALLINT      NULL,
    elective_cp         SMALLINT      NULL,
    wil_count           SMALLINT      NULL,
    wil_cp              SMALLINT      NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (course_id, major_id, intake_year, intake_month)
);
CREATE INDEX idx_planner_course        ON planner_templates(course_id);
CREATE INDEX idx_planner_course_major  ON planner_templates(course_id, major_id);
CREATE INDEX idx_planner_course_intake ON planner_templates(course_id, intake_year, intake_month);

CREATE TYPE unit_category AS ENUM (
    'core', 'major_core', 'prescribed_elective', 'elective', 'wil', 'mpu'
);

CREATE TABLE template_units (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    planner_template_id UUID            NOT NULL REFERENCES planner_templates(id) ON DELETE CASCADE,
    unit_id             UUID            NULL     REFERENCES units(id) ON DELETE RESTRICT,
    category            unit_category   NOT NULL,
    year_level          SMALLINT        NOT NULL CHECK (year_level BETWEEN 1 AND 6),
    semester            SMALLINT        NOT NULL CHECK (semester BETWEEN 1 AND 4),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT unit_id_required CHECK (
        (category = 'elective' AND unit_id IS NULL) OR (unit_id IS NOT NULL)
    ),
    UNIQUE (planner_template_id, unit_id)
);
CREATE INDEX idx_template_units_template ON template_units(planner_template_id);
CREATE INDEX idx_template_units_unit     ON template_units(unit_id);

CREATE TABLE elective_groups (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    planner_template_id UUID          NOT NULL REFERENCES planner_templates(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_elective_group_template ON elective_groups(planner_template_id);

CREATE TABLE elective_group_units (
    elective_group_id UUID NOT NULL REFERENCES elective_groups(id) ON DELETE CASCADE,
    unit_id           UUID NOT NULL REFERENCES units(id)           ON DELETE CASCADE,
    PRIMARY KEY (elective_group_id, unit_id)
);

CREATE TABLE minors (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    planner_template_id UUID          NOT NULL REFERENCES planner_templates(id) ON DELETE CASCADE,
    name                VARCHAR(255)  NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (planner_template_id, name)
);
CREATE INDEX idx_minors_planner ON minors(planner_template_id);

CREATE TABLE minor_units (
    minor_id UUID NOT NULL REFERENCES minors(id) ON DELETE CASCADE,
    unit_id  UUID NOT NULL REFERENCES units(id)  ON DELETE CASCADE,
    PRIMARY KEY (minor_id, unit_id)
);
CREATE INDEX idx_minor_units_unit ON minor_units(unit_id);

CREATE TABLE privacy_events (
    id             BIGSERIAL    PRIMARY KEY,
    event_type     VARCHAR(20)  NOT NULL CHECK (event_type IN ('presented', 'acknowledged', 'withdrawn')),
    notice_version INT          NOT NULL,
    occurred_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE security_incident_log (
    id           BIGSERIAL    PRIMARY KEY,
    event_type   VARCHAR(50)  NOT NULL,
    severity     VARCHAR(20)  NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    message      TEXT         NOT NULL,
    occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_occurred ON security_incident_log(occurred_at DESC);

CREATE TABLE audit_log (
    id            BIGSERIAL    PRIMARY KEY,
    action        VARCHAR(50)  NOT NULL,
    entity_type   VARCHAR(50),
    entity_id     UUID,
    old_value     JSONB,
    new_value     JSONB,
    performed_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_performed ON audit_log(performed_at DESC);

-- 4. Triggers
CREATE OR REPLACE FUNCTION check_major_belongs_to_course()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.major_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM majors
            WHERE id = NEW.major_id AND course_id = NEW.course_id
        ) THEN
            RAISE EXCEPTION 'major_id % does not belong to course_id %', NEW.major_id, NEW.course_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_planner_major_course_check
    BEFORE INSERT OR UPDATE ON planner_templates
    FOR EACH ROW EXECUTE FUNCTION check_major_belongs_to_course();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_majors_updated_at BEFORE UPDATE ON majors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_planner_templates_updated_at BEFORE UPDATE ON planner_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_system_config_updated_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_template_units_updated_at BEFORE UPDATE ON template_units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_elective_groups_updated_at BEFORE UPDATE ON elective_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_minors_updated_at BEFORE UPDATE ON minors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_unit_offerings_updated_at BEFORE UPDATE ON unit_offerings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Helper Functions Required by Seeds
CREATE OR REPLACE FUNCTION add_prereq_unit(
    p_target VARCHAR, p_prereq VARCHAR, p_requisite_type VARCHAR DEFAULT 'prerequisite'
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_target_id UUID; v_prereq_id UUID; v_group_id UUID;
BEGIN
    SELECT id INTO STRICT v_target_id FROM units WHERE unit_code = p_target;
    SELECT id INTO STRICT v_prereq_id FROM units WHERE unit_code = p_prereq;
    INSERT INTO unit_requisite_groups (unit_id) VALUES (v_target_id) RETURNING id INTO v_group_id;
    INSERT INTO unit_requisite_conditions (group_id, type, unit_id, requisite_type)
    VALUES (v_group_id, 'unit', v_prereq_id, p_requisite_type);
END;
$$;

CREATE OR REPLACE FUNCTION add_prereq_credits(
    p_target VARCHAR, p_credit_points NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_target_id UUID; v_group_id UUID;
BEGIN
    SELECT id INTO STRICT v_target_id FROM units WHERE unit_code = p_target;
    INSERT INTO unit_requisite_groups (unit_id) VALUES (v_target_id) RETURNING id INTO v_group_id;
    INSERT INTO unit_requisite_conditions (group_id, type, credit_points)
    VALUES (v_group_id, 'credit_points', p_credit_points);
END;
$$;

CREATE OR REPLACE FUNCTION add_prereq_and_group(
    p_target VARCHAR, p_prereqs VARCHAR[]
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_target_id UUID; v_group_id UUID; v_code VARCHAR; v_prereq_id UUID;
BEGIN
    SELECT id INTO STRICT v_target_id FROM units WHERE unit_code = p_target;
    INSERT INTO unit_requisite_groups (unit_id) VALUES (v_target_id) RETURNING id INTO v_group_id;
    FOREACH v_code IN ARRAY p_prereqs LOOP
        SELECT id INTO STRICT v_prereq_id FROM units WHERE unit_code = v_code;
        INSERT INTO unit_requisite_conditions (group_id, type, unit_id, requisite_type)
        VALUES (v_group_id, 'unit', v_prereq_id, 'prerequisite');
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION add_prereq_or(
    p_target VARCHAR, p_prereqs VARCHAR[]
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_target_id UUID; v_group_id UUID; v_code VARCHAR; v_prereq_id UUID;
BEGIN
    SELECT id INTO STRICT v_target_id FROM units WHERE unit_code = p_target;
    FOREACH v_code IN ARRAY p_prereqs LOOP
        SELECT id INTO STRICT v_prereq_id FROM units WHERE unit_code = v_code;
        INSERT INTO unit_requisite_groups (unit_id) VALUES (v_target_id) RETURNING id INTO v_group_id;
        INSERT INTO unit_requisite_conditions (group_id, type, unit_id, requisite_type)
        VALUES (v_group_id, 'unit', v_prereq_id, 'prerequisite');
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION get_course_id(p_code VARCHAR)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
    SELECT id INTO STRICT v_id FROM courses WHERE code = p_code;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_major_id(p_course_code VARCHAR, p_major_name VARCHAR)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
    SELECT m.id INTO STRICT v_id FROM majors m
    JOIN courses c ON c.id = m.course_id
    WHERE c.code = p_course_code AND m.name = p_major_name;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_planner_template(
    p_course_code VARCHAR, p_major_name VARCHAR, p_intake_year INT, p_intake_month INT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
    INSERT INTO planner_templates (course_id, major_id, intake_year, intake_month)
    VALUES (
        get_course_id(p_course_code),
        CASE WHEN p_major_name IS NULL THEN NULL ELSE get_major_id(p_course_code, p_major_name) END,
        p_intake_year::SMALLINT,
        p_intake_month::SMALLINT
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_template_units(
    p_template_id UUID, p_units VARCHAR[]
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i INT := 1;
BEGIN
    WHILE i < array_length(p_units, 1) LOOP
        INSERT INTO template_units (planner_template_id, unit_id, category, year_level, semester)
        SELECT p_template_id, u.id, p_units[i + 1]::unit_category, p_units[i + 2]::SMALLINT, p_units[i + 3]::SMALLINT
        FROM units u WHERE u.unit_code = p_units[i];
        i := i + 4;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION add_elective_slots(
    p_template_id UUID, p_slots INT[]
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i INT := 1;
BEGIN
    WHILE i < array_length(p_slots, 1) LOOP
        INSERT INTO template_units (planner_template_id, unit_id, category, year_level, semester)
        VALUES (p_template_id, NULL, 'elective', p_slots[i]::SMALLINT, p_slots[i + 1]::SMALLINT);
        i := i + 2;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION get_template_id(
    p_course_code VARCHAR, p_major_name VARCHAR, p_intake_year INT, p_intake_month INT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
    SELECT pt.id INTO STRICT v_id FROM planner_templates pt
    JOIN courses c ON c.id = pt.course_id
    LEFT JOIN majors m ON m.id = pt.major_id
    WHERE c.code = p_course_code
      AND (p_major_name IS NULL AND pt.major_id IS NULL OR m.name = p_major_name)
      AND pt.intake_year = p_intake_year
      AND (p_intake_month IS NULL AND pt.intake_month IS NULL OR pt.intake_month = p_intake_month);
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_elective_group(
    p_course_code VARCHAR, p_major_name VARCHAR, p_intake_year SMALLINT, p_intake_month SMALLINT, p_unit_codes VARCHAR[]
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_template_id UUID; v_elective_grp_id UUID; v_unit_code VARCHAR; v_unit_id UUID;
BEGIN
    v_template_id := get_template_id(p_course_code, p_major_name, p_intake_year, p_intake_month);
    INSERT INTO elective_groups (planner_template_id) VALUES (v_template_id) RETURNING id INTO v_elective_grp_id;
    FOREACH v_unit_code IN ARRAY p_unit_codes LOOP
        SELECT id INTO STRICT v_unit_id FROM units WHERE unit_code = v_unit_code;
        INSERT INTO elective_group_units (elective_group_id, unit_id) VALUES (v_elective_grp_id, v_unit_id);
    END LOOP;
    RETURN v_elective_grp_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_prereq_mixed_group(
    p_target VARCHAR, p_conditions VARCHAR[]
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_target_id UUID; v_group_id UUID; v_type VARCHAR; v_value VARCHAR; v_unit_id UUID; i INT := 1;
BEGIN
    SELECT id INTO STRICT v_target_id FROM units WHERE unit_code = p_target;
    INSERT INTO unit_requisite_groups (unit_id) VALUES (v_target_id) RETURNING id INTO v_group_id;
    WHILE i < array_length(p_conditions, 1) LOOP
        v_type := p_conditions[i]; v_value := p_conditions[i + 1];
        IF v_type = 'unit' THEN
            SELECT id INTO STRICT v_unit_id FROM units WHERE unit_code = v_value;
            INSERT INTO unit_requisite_conditions (group_id, type, unit_id, requisite_type)
            VALUES (v_group_id, 'unit', v_unit_id, 'prerequisite');
        ELSIF v_type = 'credit_points' THEN
            INSERT INTO unit_requisite_conditions (group_id, type, credit_points)
            VALUES (v_group_id, 'credit_points', v_value::NUMERIC);
        END IF;
        i := i + 2;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION add_unit_offering(
    p_unit_code VARCHAR, p_term INT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_unit_id UUID;
BEGIN
    SELECT id INTO STRICT v_unit_id FROM units WHERE unit_code = p_unit_code;
    INSERT INTO unit_offerings (unit_id, offered_in) 
    VALUES (v_unit_id, p_term::SMALLINT) 
    ON CONFLICT DO NOTHING;
END;
$$;