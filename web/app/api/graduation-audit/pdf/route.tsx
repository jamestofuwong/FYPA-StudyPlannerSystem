import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { getAuditSession } from '../store';

const styles = StyleSheet.create({
  page: { fontFamily: 'Times-Roman', fontSize: 10, padding: '15mm 15mm 15mm 15mm', color: '#000' },
  header: { textAlign: 'center', marginBottom: 10 },
  university: { fontSize: 13, fontFamily: 'Times-Bold', letterSpacing: 0.5 },
  docTitle: { fontSize: 11, fontFamily: 'Times-Italic', marginTop: 3 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#000', marginVertical: 8 },
  sectionTitle: { fontSize: 9, fontFamily: 'Times-Bold', letterSpacing: 1, borderBottomWidth: 0.5, borderBottomColor: '#888', paddingBottom: 2, marginBottom: 7, color: '#000' },
  metaRow: { flexDirection: 'row', gap: 30, fontSize: 9, marginBottom: 8, flexWrap: 'wrap' },
  metaLabel: { fontFamily: 'Times-Bold' },
  infoRow: { flexDirection: 'row', marginBottom: 2 },
  infoLabel: { fontFamily: 'Times-Bold', width: 130 },
  infoValue: { flex: 1 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderTopWidth: 1, borderColor: '#000', paddingVertical: 3, fontFamily: 'Times-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 2 },
  tableTotalRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#000', paddingVertical: 3, fontFamily: 'Times-Bold' },
  colCategory: { flex: 3 },
  colNum: { flex: 1 },
  eligible: { color: '#006600', fontFamily: 'Times-Bold' },
  notEligible: { color: '#cc0000', fontFamily: 'Times-Bold' },
  riskLevel: { fontSize: 10, marginBottom: 4 },
  riskBold: { fontFamily: 'Times-Bold' },
  riskItem: { fontSize: 10, marginBottom: 3, paddingLeft: 8 },
  missingItem: { fontSize: 10, marginBottom: 2, paddingLeft: 12 },
  notesArea: { minHeight: 60, borderBottomWidth: 0.5, borderBottomColor: '#bbb', marginBottom: 8 },
  signoffBlock: { marginBottom: 16 },
  signoffRole: { fontFamily: 'Times-Bold', marginBottom: 10 },
  signoffOptional: { fontFamily: 'Times-Italic', fontWeight: 'normal' },
  signoffLine: { marginBottom: 14 },
  footer: { marginTop: 16, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#888', fontSize: 7, color: '#555', textAlign: 'center' },
});

function fmt(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function statusCell(matched: number | undefined, required: number | undefined): string {
  if (required == null) return '—';
  if (matched == null) return `0/${required}`;
  return matched >= required ? '✓' : `${matched}/${required}`;
}

function AuditDocument({ session }: { session: any }) {
  const student = session.student;
  const matchData = session.matchResult?.data;
  const graduationCheck = session.matchResult?.graduationCheck;
  const riskReport = matchData?.riskReport;
  const primaryMajor = matchData?.primaryMajor;
  const unmatchedCore: string[] = matchData?.unmatchedCore ?? [];
  const breakdown = primaryMajor?.breakdown ?? {};
  const generatedAt = new Date(session.createdAt);

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.university}>SWINBURNE UNIVERSITY OF TECHNOLOGY SARAWAK</Text>
          <Text style={styles.docTitle}>Student Academic Progression Audit</Text>
        </View>

        <View style={styles.metaRow}>
          <Text><Text style={styles.metaLabel}>AUDIT REFERENCE  </Text>{session.auditRef}</Text>
          <Text><Text style={styles.metaLabel}>DATE GENERATED  </Text>{fmt(generatedAt)}, {generatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>

        <View style={styles.divider} />

        {/* Student Information */}
        <Text style={styles.sectionTitle}>STUDENT INFORMATION</Text>
        {[
          ['Student ID',           student.studentId ?? '—'],
          ['Name',                 student.studentName ?? '—'],
          ['Programme',            student.course ?? '—'],
          ['Major',                primaryMajor?.majorName ?? 'Not detected'],
          ['Enrolment Date',       student.enrollmentDate ?? '—'],
          ['Expected Graduation',  student.graduationDate ?? '—'],
          ['CGPA',                 student.cgpa != null ? Number(student.cgpa).toFixed(2) : '—'],
          ['Grade Level',          student.gradeLevel ?? '—'],
        ].map(([label, value]) => (
          <View key={label} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        {/* Credit Summary */}
        <Text style={styles.sectionTitle}>CREDIT SUMMARY</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colCategory}>Category</Text>
          <Text style={styles.colNum}>Required</Text>
          <Text style={styles.colNum}>Earned</Text>
          <Text style={styles.colNum}>Status</Text>
        </View>
        {[
          ['Core Units',            breakdown?.core],
          ['Major Core Units',      breakdown?.majorCore],
          ['Prescribed Electives',  breakdown?.prescribed],
          ['Free Electives',        breakdown?.freeElective],
          ['WIL',                   breakdown?.wil],
        ].map(([label, b]: any) => (
          <View key={label} style={styles.tableRow}>
            <Text style={styles.colCategory}>{label}</Text>
            <Text style={styles.colNum}>{b?.required ?? '—'}</Text>
            <Text style={styles.colNum}>{b?.matched ?? '—'}</Text>
            <Text style={styles.colNum}>{statusCell(b?.matched, b?.required)}</Text>
          </View>
        ))}
        <View style={styles.tableTotalRow}>
          <Text style={styles.colCategory}>TOTAL CREDITS</Text>
          <Text style={styles.colNum}>{student.creditsRequired ?? '—'}</Text>
          <Text style={styles.colNum}>{student.creditsCompleted ?? '—'}</Text>
          <Text style={styles.colNum}></Text>
        </View>

        <View style={[styles.metaRow, { marginTop: 6 }]}>
          <Text><Text style={styles.metaLabel}>Overall Match  </Text>{primaryMajor?.matchPct != null ? `${Number(primaryMajor.matchPct).toFixed(1)}%` : '—'}</Text>
          <Text>
            <Text style={styles.metaLabel}>Graduation Eligibility  </Text>
            <Text style={graduationCheck?.isEligible ? styles.eligible : styles.notEligible}>
              {graduationCheck?.isEligible ? 'ELIGIBLE' : 'NOT YET ELIGIBLE'}
            </Text>
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Detection Result */}
        <Text style={styles.sectionTitle}>DETECTION RESULT</Text>
        {[
          ['Primary Major',    `${primaryMajor?.majorName ?? 'Not detected'}${primaryMajor?.matchPct != null ? ` (${Number(primaryMajor.matchPct).toFixed(1)}%)` : ''}`],
          ['Second Major',     matchData?.secondMajor?.majorName ?? '—'],
          ['Detection Status', matchData?.status ?? '—'],
        ].map(([label, value]) => (
          <View key={label} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        {/* Missing Requirements */}
        {unmatchedCore.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>MISSING REQUIREMENTS</Text>
            <Text style={[styles.riskLevel, { marginBottom: 4 }]}>
              <Text style={styles.riskBold}>Core Units</Text> ({unmatchedCore.length} missing)
            </Text>
            {unmatchedCore.map((u: string) => (
              <Text key={u} style={styles.missingItem}>• {u}</Text>
            ))}
            <View style={styles.divider} />
          </>
        )}

        {/* At-Risk Assessment */}
        {riskReport && (
          <>
            <Text style={styles.sectionTitle}>AT-RISK ASSESSMENT</Text>
            <Text style={styles.riskLevel}>Overall Level: <Text style={styles.riskBold}>{riskReport.level?.toUpperCase()}</Text></Text>
            {riskReport.factors?.map((f: any) => (
              <Text key={f.id} style={styles.riskItem}><Text style={styles.riskBold}>{f.title}:</Text> {f.description}</Text>
            ))}
            <View style={styles.divider} />
          </>
        )}

        {/* Advisor Notes */}
        <Text style={styles.sectionTitle}>ADVISOR NOTES</Text>
        <View style={styles.notesArea} />

        <View style={styles.divider} />

        {/* Sign-off */}
        <Text style={styles.sectionTitle}>SIGN-OFF</Text>
        <View style={styles.signoffBlock}>
          <Text style={styles.signoffRole}>Academic Advisor</Text>
          <Text style={styles.signoffLine}>Name: _______________________________{'  '}Date: ___________</Text>
          <Text style={styles.signoffLine}>Signature: ___________________________</Text>
        </View>
        <View style={styles.signoffBlock}>
          <Text style={styles.signoffRole}>Head of Department <Text style={styles.signoffOptional}>(if required)</Text></Text>
          <Text style={styles.signoffLine}>Name: _______________________________{'  '}Date: ___________</Text>
          <Text style={styles.signoffLine}>Signature: ___________________________</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>This document was generated by the Study Planner System.</Text>
          <Text>Ref: {session.auditRef}  |  For internal use only. Contains academic data — handle per university privacy policy.</Text>
        </View>

      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const session = getAuditSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }

  const buffer = await renderToBuffer(<AuditDocument session={session} />);

  const filename = `GraduationAudit-${session.student?.studentId ?? 'unknown'}-${session.auditRef}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
