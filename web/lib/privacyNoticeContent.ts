/**
 * privacyNoticeContent.ts
 *
 * Bilingual privacy notice text (English + Bahasa Malaysia).
 * Increment NOTICE_VERSION whenever the content materially changes —
 * users who acknowledged an older version will be shown the modal again.
 *
 * Covers REQ-PRI-102 and REQ-PRI-103 (a–d).
 */

export const NOTICE_VERSION = 1;

export interface PrivacySection {
  heading: string;
  body: string[];
}

export interface PrivacyNoticeContent {
  title: string;
  subtitle: string;
  sections: PrivacySection[];
  dpo: {
    heading: string;
    name: string;
    email: string;
    address: string;
  };
  buttonLabel: string;
}

export const PRIVACY_NOTICE: Record<'en' | 'ms', PrivacyNoticeContent> = {
  // -------------------------------------------------------------------------
  // English
  // -------------------------------------------------------------------------
  en: {
    title: 'Privacy Notice',
    subtitle:
      'Please read this notice carefully before proceeding. By clicking "I Acknowledge", you confirm that you have read and understood this Privacy Notice.',

    sections: [
      {
        // REQ-PRI-103 (a) — purposes
        heading: 'A. Purposes of Data Collection and Processing',
        body: [
          'The Study Planner System ("the System") is a locally operated academic planning tool. All data processing occurs exclusively on your device and is never transmitted to external servers without your knowledge.',
          'Student personal data is collected and processed solely for the following purposes:',
          '(1) Generating a personalised academic study plan based on the student\'s enrolled programme, completed units, and remaining requirements.',
          '(2) Tracking unit completion status and credit point progress against the prescribed programme structure.',
          '(3) Identifying elective unit options and graduation eligibility based on the student\'s academic record.',
          '(4) Producing advisory output to assist academic advisors and students in planning future enrolments.',
          'Data is not used for profiling, marketing, automated decision-making, or any purpose beyond academic planning support.',
        ],
      },
      {
        // REQ-PRI-103 (b) — classes of data
        heading: 'B. Classes of Personal Data Collected',
        body: [
          'The System may collect and process the following classes of personal data:',
          '(1) Student identification data — student name and student ID number, as contained in the official academic transcript.',
          '(2) Academic records — unit codes, unit names, credit points, grades, academic term/semester, and completion status.',
          '(3) Programme enrolment data — enrolled course, major/specialisation, intake year and intake month.',
          'No sensitive personal data (as defined under the Personal Data Protection Act 2010) is collected. Financial, health, or biometric data is not processed by this System.',
        ],
      },
      {
        // REQ-PRI-103 (c) — rights
        heading: 'C. Your Rights as a Data Subject',
        body: [
          'Under the Personal Data Protection Act 2010 (Malaysia), you have the following rights in relation to your personal data:',
          '(1) Right of Access — you may request a copy of the personal data held about you within this System at any time.',
          '(2) Right of Correction — you may request that inaccurate or incomplete personal data be corrected.',
          '(3) Right to Withdraw Consent — you may withdraw your consent to the processing of your personal data at any time through the Settings page. Upon withdrawal, the System will cease processing your data for the stated purposes. Note that withdrawal does not affect the lawfulness of processing carried out prior to withdrawal.',
          'To exercise any of the above rights, please contact the Data Protection Officer listed below or raise the matter with your academic advisor.',
        ],
      },
    ],

    dpo: {
      // REQ-PRI-103 (d) — DPO contact
      heading: 'D. Data Protection Officer Contact',
      name: 'Data Protection Officer, Swinburne University of Technology Sarawak Campus',
      email: 'evgan@swinburne.edu.my',
      address: 'Jalan Simpang Tiga, 93350 Kuching, Sarawak, Malaysia',
    },

    buttonLabel: 'I Acknowledge / Saya Faham',
  },

  // -------------------------------------------------------------------------
  // Bahasa Malaysia
  // -------------------------------------------------------------------------
  ms: {
    title: 'Notis Privasi',
    subtitle:
      'Sila baca notis ini dengan teliti sebelum meneruskan. Dengan mengklik "Saya Faham", anda mengesahkan bahawa anda telah membaca dan memahami Notis Privasi ini.',

    sections: [
      {
        // REQ-PRI-103 (a) — purposes
        heading: 'A. Tujuan Pengumpulan dan Pemprosesan Data',
        body: [
          'Sistem Perancang Pengajian ("Sistem") ialah alat perancangan akademik yang beroperasi secara tempatan. Semua pemprosesan data berlaku secara eksklusif pada peranti anda dan tidak pernah dihantar ke pelayan luaran tanpa pengetahuan anda.',
          'Data peribadi pelajar dikumpul dan diproses semata-mata untuk tujuan berikut:',
          '(1) Menghasilkan pelan pengajian akademik yang diperibadikan berdasarkan program yang didaftarkan oleh pelajar, unit yang telah diselesaikan, dan keperluan yang masih berbaki.',
          '(2) Menjejaki status penyiapan unit dan kemajuan mata kredit berbanding struktur program yang ditetapkan.',
          '(3) Mengenal pasti pilihan unit elektif dan kelayakan graduasi berdasarkan rekod akademik pelajar.',
          '(4) Menghasilkan output nasihat untuk membantu penasihat akademik dan pelajar dalam merancang pendaftaran masa hadapan.',
          'Data tidak digunakan untuk pemrofilan, pemasaran, membuat keputusan secara automatik, atau sebarang tujuan di luar sokongan perancangan akademik.',
        ],
      },
      {
        // REQ-PRI-103 (b) — classes of data
        heading: 'B. Kelas Data Peribadi yang Dikumpul',
        body: [
          'Sistem mungkin mengumpul dan memproses kelas data peribadi berikut:',
          '(1) Data pengenalan pelajar — nama pelajar dan nombor ID pelajar, seperti yang terkandung dalam transkrip akademik rasmi.',
          '(2) Rekod akademik — kod unit, nama unit, mata kredit, gred, penggal/semester akademik, dan status penyiapan.',
          '(3) Data pendaftaran program — kursus yang didaftarkan, major/pengkhususan, tahun pengambilan dan bulan pengambilan.',
          'Tiada data peribadi sensitif (sebagaimana yang ditakrifkan di bawah Akta Perlindungan Data Peribadi 2010) dikumpul. Data kewangan, kesihatan, atau biometrik tidak diproses oleh Sistem ini.',
        ],
      },
      {
        // REQ-PRI-103 (c) — rights
        heading: 'C. Hak Anda sebagai Subjek Data',
        body: [
          'Di bawah Akta Perlindungan Data Peribadi 2010 (Malaysia), anda mempunyai hak berikut berkaitan data peribadi anda:',
          '(1) Hak Akses — anda boleh meminta salinan data peribadi yang disimpan tentang anda dalam Sistem ini pada bila-bila masa.',
          '(2) Hak Pembetulan — anda boleh meminta data peribadi yang tidak tepat atau tidak lengkap diperbetulkan.',
          '(3) Hak Menarik Balik Persetujuan — anda boleh menarik balik persetujuan anda terhadap pemprosesan data peribadi anda pada bila-bila masa melalui halaman Tetapan. Setelah penarikan balik, Sistem akan berhenti memproses data anda untuk tujuan yang dinyatakan. Perhatikan bahawa penarikan balik tidak menjejaskan kesahan pemprosesan yang dilakukan sebelum penarikan balik.',
          'Untuk menggunakan mana-mana hak di atas, sila hubungi Pegawai Perlindungan Data yang disenaraikan di bawah atau kemukakan perkara tersebut kepada penasihat akademik anda.',
        ],
      },
    ],

    dpo: {
      // REQ-PRI-103 (d) — DPO contact
      heading: 'D. Maklumat Hubungan Pegawai Perlindungan Data',
      name: 'Pegawai Perlindungan Data, Universiti Teknologi Swinburne Kampus Sarawak',
      email: 'evgan@swinburne.edu.my',
      address: 'Jalan Simpang Tiga, 93350 Kuching, Sarawak, Malaysia',
    },

    buttonLabel: 'Saya Faham / I Acknowledge',
  },
};
