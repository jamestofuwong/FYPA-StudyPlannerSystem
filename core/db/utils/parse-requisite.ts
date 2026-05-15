export type ParsedCondition = {
  type: 'unit' | 'credit_points';
  unit_code?: string;
  credit_points?: number;
  requisite_type?: 'prerequisite' | 'corequisite' | 'antirequisite' | null;
};

export type ParsedGroup = {
    conditions: ParsedCondition[];
};


// Parses a prerequisite string into structured groups and conditions.
 
// / = OR (separate groups)
// & = AND (same group)

export function parseRequisiteString(input: string | null): ParsedGroup[] {
    // Return empty input
    if (!input || input.trim() === '') return [];

    // Normalize: uppercase, replace operators, normalize prefixes
    const normalized = input
        .toUpperCase()
        .replace(/CO-REQUISITE|CO-REQ/g, 'corequisite')
        .replace(/ANTI-REQUISITE|ANTI-REQ/g, 'antirequisite')
        .replace(/PRE-REQUISITES|PRE-REQUISITE|PRE-REQ/g, 'prerequisite')
        .replace(/CREDIT\s+POINTS?/g, 'cp') 
        .replace(/CREDIT\s+POINT?/g, 'cp') 
        .replace(/:/g, '')  
        .replace(/\s+OR\s+/g, ' / ')
        .replace(/\s+AND\s+/g, ' & ')
        .replace(/\n/g, ' ');

    const groups: ParsedGroup[] = [];

    // ----------- Split by / (OR logic) -----------
    // Each part becomes its own group
    const orParts = normalized.split('/').map(s => s.trim());

    // Shared type carries across / when no new prefix is given
    // e.g. "corequisite A / B " = both A, B are corequisite
    let sharedType: 'prerequisite' | 'corequisite' | 'antirequisite' = 'prerequisite';

    for (const part of orParts) {
        // Start with the shared type
        let requisiteType = sharedType;
        let remaining = part;

        // ----------- Group-level prefix check -----------
        // Check if this part starts with a type prefix
        // If so, update both the current type and the shared type
        // so following parts without a prefix inherit it
        if (remaining.startsWith('corequisite ')) {
            requisiteType = 'corequisite';
            sharedType = 'corequisite';
            remaining = remaining.slice('corequisite'.length).trim();
        } else if (remaining.startsWith('antirequisite ')) {
            requisiteType = 'antirequisite';
            sharedType = 'antirequisite';
            remaining = remaining.slice('antirequisite'.length).trim();
        } else if (remaining.startsWith('prerequisite ')) {
            sharedType = 'prerequisite';
            remaining = remaining.slice('prerequisite'.length).trim();
        }

        // ----------- Split by & (AND logic) -----------
        // All pieces in one group must be satisfied
        const andParts = remaining.split('&').map(s => s.trim());
        const conditions: ParsedCondition[] = [];

        for (const piece of andParts) {
            // Each piece can override its own type
            // e.g. "A & corequisite B" = A (prerequisite) & B (courequisite)
            let pieceRequisiteType = requisiteType;
            let pieceRemaining = piece;

            // ----------- Per-piece prefix check -----------
            if (pieceRemaining.startsWith('corequisite ')) {
                pieceRequisiteType = 'corequisite';
                pieceRemaining = pieceRemaining.slice('corequisite'.length).trim();
            } else if (pieceRemaining.startsWith('antirequisite ')) {
                pieceRequisiteType = 'antirequisite';
                pieceRemaining = pieceRemaining.slice('antirequisite'.length).trim();
            } else if (pieceRemaining.startsWith('prerequisite ')) {
                pieceRemaining = pieceRemaining.slice('prerequisite'.length).trim();
            }

            // ----------- Classify: credit points or unit -----------
            const cpMatch = pieceRemaining.match(/^(\d+(?:\.\d+)?)\s*cp$/i);
            if (cpMatch) {
                conditions.push({
                    type: 'credit_points',
                    credit_points: parseFloat(cpMatch[1]),
                });
            } else {
                conditions.push({
                    type: 'unit',
                    unit_code: pieceRemaining,
                    requisite_type: pieceRequisiteType,
                });
            }
        }

        // Only add group if it has conditions
        if (conditions.length > 0) {
            groups.push({ conditions });
        }
    }

    return groups;
}