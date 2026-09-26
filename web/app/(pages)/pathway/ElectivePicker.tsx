'use client';

import { useState } from 'react';
import styles from './page.module.css';
import type { SchedulableUnit } from '../../../../core/services/scheduling/customPlannerScheduler';
import type { CatalogueUnit } from '../../api/custom-planner/catalogue/route';
import { offeringHint } from './terms';

export type PickerSource = 'planner' | 'catalogue';

/** A semester an elective can be added to, with the calendar term it runs in. */
export type PickerSlot = { key: string; label: string; term: 1 | 2 };

type Props = {
  /** Section one. Already narrowed to units that may be chosen. */
  plannerUnits: SchedulableUnit[];
  /** Section two. Already narrowed to units that may be chosen. */
  catalogueUnits: CatalogueUnit[];
  prefixes: string[];
  loading: boolean;
  /** Calendar term the choice will run in, for the offering hint. */
  term: 1 | 2;
  /** Set only when the advisor picks the semester too, as when filling a gap. */
  slots?: PickerSlot[];
  slotKey?: string;
  onSlotChange?: (key: string) => void;
  title: string;
  onChoose: (unit: SchedulableUnit, source: PickerSource) => void;
  onClose: () => void;
};

/**
 * The one place an advisor chooses an elective. Swapping a row, filling a
 * placeholder and filling a gap after a removal all open this, so the options,
 * the search and the wording cannot differ between them.
 */
export default function ElectivePicker({
  plannerUnits,
  catalogueUnits,
  prefixes,
  loading,
  term,
  slots,
  slotKey,
  onSlotChange,
  title,
  onChoose,
  onClose,
}: Props) {
  const [search, setSearch] = useState('');
  const [prefix, setPrefix] = useState('ALL');

  const query = search.trim().toLowerCase();
  const matches = (u: SchedulableUnit) =>
    query === '' || u.code.toLowerCase().includes(query) || u.name.toLowerCase().includes(query);

  const fromPlanner = plannerUnits.filter(matches);
  const fromCatalogue = catalogueUnits
    .filter((u) => prefix === 'ALL' || u.prefix === prefix)
    .filter(matches);

  const renderOption = (unit: SchedulableUnit, source: PickerSource) => {
    const hint = offeringHint(unit, term);
    return (
      <li key={unit.code}>
        <button
          type="button"
          className={styles.catalogueItem}
          onClick={() => onChoose(unit, source)}
        >
          <span className={styles.catalogueCode}>{unit.code}</span>
          <span className={styles.catalogueName}>{unit.name}</span>
          {hint && <span className={styles.catalogueHint}>· {hint}</span>}
        </button>
      </li>
    );
  };

  return (
    <div className={styles.cataloguePanel} role="dialog" aria-label={title}>
      <div className={styles.pickerHeader}>
        <span className={styles.pickerTitle}>{title}</span>
        {slots && slots.length > 0 && (
          <select
            className={styles.catalogueFilter}
            value={slotKey}
            aria-label="Semester to add the elective to"
            onChange={(e) => onSlotChange?.(e.target.value)}
          >
            {slots.map((slot) => (
              <option key={slot.key} value={slot.key}>{slot.label}</option>
            ))}
          </select>
        )}
        <button type="button" className={styles.catalogueBtn} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.catalogueControls}>
        <input
          className={styles.catalogueSearch}
          type="search"
          value={search}
          placeholder="Search by code or name"
          aria-label="Search electives"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.pickerSectionTitle}>From this planner&apos;s elective list</div>
      {fromPlanner.length > 0 ? (
        <ul className={styles.catalogueList}>{fromPlanner.map((u) => renderOption(u, 'planner'))}</ul>
      ) : (
        <div className={styles.catalogueEmpty}>No units left in this planner&apos;s elective list.</div>
      )}

      <div className={styles.pickerSectionTitle}>
        <span>Outside the planner</span>
        <select
          className={styles.catalogueFilter}
          value={prefix}
          aria-label="Filter by unit code prefix"
          onChange={(e) => setPrefix(e.target.value)}
        >
          <option value="ALL">All prefixes</option>
          {prefixes.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className={styles.catalogueEmpty}>Loading units…</div>
      ) : fromCatalogue.length > 0 ? (
        <ul className={styles.catalogueList}>{fromCatalogue.map((u) => renderOption(u, 'catalogue'))}</ul>
      ) : (
        <div className={styles.catalogueEmpty}>No units match that search.</div>
      )}
    </div>
  );
}
