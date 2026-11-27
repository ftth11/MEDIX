// MEDIX application logic extracted verbatim from the original index.html.

const firebaseConfig = {
            apiKey: "AIzaSyC9TDnm98rLYGmrbF51OjQp4u4I0zOxu18",
            authDomain: "medix-rsudpg.firebaseapp.com",
            projectId: "medix-rsudpg",
            storageBucket: "medix-rsudpg.firebasestorage.app",
            messagingSenderId: "180949383110",
            appId: "1:180949383110:web:cdda6afad7c54c555e24c7",
            measurementId: "G-MZ45688DDB"
        };
        
        if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
        const db = firebase.firestore();
        const auth = firebase.auth();
        const storage = firebase.storage();

        // Untuk komputer/HP bersama, gunakan SESSION: refresh tetap masuk,
        // tetapi sesi tidak dipertahankan setelah tab/browser ditutup.
        auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
            .catch(error => console.warn('Persistence Auth gagal diatur:', error.code || error.message));

        // Cache Firestore di perangkat agar pembukaan berikutnya lebih cepat.
        let firestorePersistenceReady = false;
        db.enablePersistence({ synchronizeTabs: true })
            .then(() => { firestorePersistenceReady = true; console.info('Firestore offline persistence aktif.'); })
            .catch((error) => { console.warn('Firestore persistence tidak tersedia:', error.code || error.message); });

        // PWA SERVICE WORKER REGISTRATION
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('ServiceWorker registered!'))
                    .catch(err => console.log('ServiceWorker error:', err));
            });
        }
        
        async function loadFirebaseUserProfile(firebaseUser) {
            if (!firebaseUser) return null;
            try {
                // Struktur akun MEDIX sekarang konsisten: users/{Firebase Auth UID}.
                // Tidak lagi melakukan query fallback email/username sehingga login
                // cukup satu pembacaan profil Firestore.
                const snap = await db.collection('users').doc(firebaseUser.uid).get();
                if (!snap.exists) return null;

                const data = snap.data() || {};
                if (data.aktif === false) return null;

                return {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email || data.email || '',
                    ...data
                };
            } catch (error) {
                console.error('Gagal mengambil profil user:', error);
                return null;
            }
        }

        function canonicalRole(role) {
            const r = String(role || 'User').trim().toLowerCase();
            if (r === 'admin') return 'Admin';
            if (r === 'teknisi' || r === 'technician') return 'Teknisi';
            return 'User';
        }

        function applyUserContext(userData) {

            if (!userData) {
                return false;
            }
        
            // Identitas user
            currentUserNama =
                userData.nama ||
                userData.username ||
                userData.email ||
                "User";
        
            // Role
            currentActiveRole = canonicalRole(userData.role);
        
            // Permission
            userAksesMenuArray = normalisasiMenuAkses(userData.menuAkses || {}, currentActiveRole);
        
            // Simpan data user untuk kebutuhan aplikasi lama
            currentUser = {
                uid: userData.uid,
                email: userData.email || "",
                nama: userData.nama || "",
                username: userData.username || "",
                role: userData.role || "User",
                menuAkses: userAksesMenuArray || {},
                unitId: userData.unitId || null,
                photoURL: userData.photoURL || userData.fotoProfil || '',
                aktif: userData.aktif !== false
            };
            medixRenderSidebarProfile(currentUser.photoURL);
        
            return true;
        }

        function syncMasterHeaderActions() {
            const container = document.getElementById('master-action-buttons-container');
            if (!container) return;
            const masterRead = !!(typeof izinMenu === 'function' ? izinMenu('master', 'read') : false);
            const role = canonicalRole(currentActiveRole);
            const canLabel = masterRead && izinMenu('label','print');

            // Satu renderer untuk seluruh tombol header Master Data. Dengan cara ini
            // tombol label tidak mungkin terhapus ketika tombol lain dirender ulang.
            const masterTambah = masterRead && typeof izinMenu === 'function' && izinMenu('master', 'tambah');
            const masterImport = masterRead && typeof izinMenu === 'function' && izinMenu('master', 'import');
            const masterExport = masterRead && typeof izinMenu === 'function' && izinMenu('master', 'export');

            const buttons = [];
            if (masterExport) buttons.push(`<button type="button" onclick="exportKeExcelMassal()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center shadow transition"><i class="fa-solid fa-file-excel mr-1.5"></i> Export Excel</button>`);
            if (masterImport) buttons.push(`<label class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center shadow transition cursor-pointer"><i class="fa-solid fa-file-arrow-up mr-1.5"></i> Import Excel<input type="file" id="file-excel-input" accept=".xlsx,.xls,.csv" onchange="importDataDariExcel(event)" class="hidden"></label>`);
            if (masterTambah) buttons.push(`<button type="button" onclick="openModalAlatManual()" class="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-1.5 rounded-xl text-xs font-semibold hover:from-blue-700 transition shadow"><i class="fa-solid fa-plus mr-1"></i> Tambah Manual</button>`);
            if (canLabel) {
                buttons.push(`<button type="button" id="btn-print-label-master" onclick="cetakLabelBarcodeMassalPdf()" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center shadow transition" title="Preview dan cetak seluruh label aset medis"><i class="fa-solid fa-print mr-1.5"></i> Cetak Label</button>`);

            }
            container.innerHTML = buttons.join('');
            container.style.display = buttons.length ? 'flex' : 'none';
            container.setAttribute('aria-hidden', buttons.length ? 'false' : 'true');
        }

        function ensureUserEticketForm() {
            const box = document.getElementById('box-form-buat-ticket');
            if (!box) return;
            const role = canonicalRole(currentActiveRole);
            const canReport = role === 'User' || izinMenu('ticket', 'lapor');
            box.classList.toggle('hidden', !canReport);
            box.style.display = canReport ? '' : 'none';
            box.setAttribute('aria-hidden', canReport ? 'false' : 'true');
        }

        function renderSidebarByPermission() {
            const bhpAllowed = (canonicalRole(currentActiveRole) === 'Admin' || canonicalRole(currentActiveRole) === 'Teknisi') && izinMenu('equipment', 'read');
            const checks = {
                dashboard: izinMenu('dashboard', 'read'),
                master: izinMenu('master', 'read'),
                ticket: canonicalRole(currentActiveRole) === 'User' ? true : izinMenu('ticket', 'read'),
                riwayat: izinMenu('riwayat', 'read'),
                equipment: izinMenu('equipment', 'read'),
                bhp: bhpAllowed,
                akun: izinMenu('akun', 'read')
            };
            const ids = {
                dashboard: 'btn-dashboard', master: 'btn-data-alat', ticket: 'btn-ticket-system',
                riwayat: 'btn-kalibrasi', equipment: 'btn-equipment', bhp: 'btn-bhp', akun: 'btn-kelola-akun'
            };
            Object.entries(ids).forEach(([menu, id]) => {
                const el = document.getElementById(id);
                if (el) el.classList.toggle('hidden', !checks[menu]);
            });

            document.querySelectorAll('.menu-akses-admin-saja').forEach(el => {
                el.classList.toggle('hidden', !checks.akun);
            });
            document.querySelectorAll('.menu-akses-teknisi').forEach(el => {
                el.classList.toggle('hidden', !izinMenu('ticket', 'kerjakan'));
            });

            const activeTab = ['dashboard','data-alat','ticket-system','kalibrasi','equipment','bhp','kelola-akun']
                .find(tab => {
                    if (tab === 'bhp') return bhpAllowed;
                    const menu = tab === 'data-alat' ? 'master' : tab === 'ticket-system' ? 'ticket' : tab === 'kalibrasi' ? 'riwayat' : tab === 'kelola-akun' ? 'akun' : tab;
                    return izinMenu(menu, 'read');
                });
            if (activeTab) switchTab(activeTab);
            renderBottomNavigation();
        }

        function renderBottomNavigation(activeTab) {
            const nav = document.getElementById('medix-mobile-bottom-nav');
            if (!nav) return;
            const checks = {
                dashboard: izinMenu('dashboard','read'),
                'data-alat': izinMenu('master','read'),
                'ticket-system': canonicalRole(currentActiveRole) === 'User' ? true : izinMenu('ticket','read'),
                equipment: izinMenu('equipment','read')
            };
            nav.querySelectorAll('button[data-tab]').forEach(btn => {
                const tab = btn.dataset.tab;
                if (tab === 'more') { btn.classList.remove('hidden'); return; }
                btn.classList.toggle('hidden', !checks[tab]);
                btn.classList.toggle('active', tab === activeTab);
            });
        }

        async function loginWithFirebaseAuth(email, password) {
            // Auth saja di sini. Profil Firestore dimuat SATU kali oleh
            // auth.onAuthStateChanged(), sehingga proses login tidak melakukan
            // pembacaan users dua kali.
            try {
                const credential = await auth.signInWithEmailAndPassword(
                    email,
                    password
                );
                return credential.user;
            } catch (error) {
                console.error("Firebase Authentication Error:", error);
                throw error;
            }
        }

        let currentActiveRole = "";
        let targetLoginRole = "";
        let currentUserNama = "";
        let userAksesMenuArray = {};
        let currentUser = null;
        let currentEMSubTab = 'database';
        let dataEquipment = []; // Projection per unit dari Master Data Aset
        let dataLembarKerja = []; // Seluruh LK untuk Rekapan EM
        let dataMaintenance = []; // Seluruh histori maintenance untuk Rekapan EM
        let activeSubTabEM = 'database';
        
        let firestoreListenerSudahDimulai = false;
        let firestoreUnsubscribers = [];
        let activeListenerUid = "";
        let dataAlatInitialSnapshotSudahDiproses = false;
        let equipmentSyncTimer = null;
        let equipmentSyncQueue = new Map();
        let renderAllTimer = null;
        let rekonsiliasiStatusTimer = null;

        function jadwalkanRenderAll(delay = 16) {
            if (renderAllTimer) clearTimeout(renderAllTimer);
            renderAllTimer = setTimeout(() => {
                renderAllTimer = null;
                try { renderAll(); } catch (error) { console.error('Render UI gagal:', error); }
            }, delay);
        }

        function hentikanListenerFirestore() {
            firestoreUnsubscribers.forEach((unsubscribe) => {
                try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (error) {}
            });
            firestoreUnsubscribers = [];
            firestoreListenerSudahDimulai = false;
            activeListenerUid = "";
            dataAlatInitialSnapshotSudahDiproses = false;
            dataTiket = [];
            dataKeluhanLog = [];
            dataUserSistem = [];
        }

        function mulaiListenerFirestore() {
            const uidSaatIni = auth.currentUser ? auth.currentUser.uid : "";

            // Jika user/role berubah dalam tab yang sama, listener lama wajib
            // dilepas. Ini mencegah listener User tetap aktif ketika kemudian
            // login sebagai Teknisi/Admin dan merupakan sumber data yang tidak sinkron.
            if (firestoreListenerSudahDimulai && activeListenerUid === uidSaatIni) {
                return;
            }

            if (firestoreListenerSudahDimulai) {
                hentikanListenerFirestore();
            }

            firestoreListenerSudahDimulai = true;
            activeListenerUid = uidSaatIni;
            console.log("Memulai listener Firestore untuk UID:", uidSaatIni, "role:", currentActiveRole);

            if (currentActiveRole === 'Admin' || currentActiveRole === 'Teknisi') {
                firestoreUnsubscribers.push(db.collection("users").onSnapshot(
                    (querySnapshot) => {
                        dataUserSistem = [];
                        querySnapshot.forEach((doc) => {
                            dataUserSistem.push({ id: doc.id, ...doc.data() });
                        });
                        listNamaTeknisi = dataUserSistem
                            .filter(u => u.role === 'Teknisi' && u.aktif !== false)
                            .map(u => u.nama);
                        listNamaSaksi = dataUserSistem
                            .filter(u => u.role === 'User' && u.aktif !== false)
                            .map(u => u.nama);
                        populasikanDropdownNamaTandaTangan();
                        renderDaftarUser();
                    },
                    (error) => {
                        console.error("Listener users gagal:", error);
                        // Kegagalan daftar akun tidak boleh mematikan dashboard/ticket.
                        // Admin memang membutuhkan collection users untuk Kelola Akun,
                        // sedangkan Teknisi membutuhkannya untuk dropdown Teknisi/Saksi.
                        // Detail error ditulis ke console agar mudah ditelusuri tanpa
                        // membuat popup berulang pada setiap reconnect Firestore.
                        console.warn("Daftar akun tidak dapat dimuat. Firestore Rules users menolak query.", error?.code || error?.message || error);
                        // Jangan tampilkan popup berulang. Jika Kelola Akun dibuka
                        // dan daftar memang kosong, error dapat dilihat di Console.
                    }
                ));
            } else {
                dataUserSistem = currentUser ? [{ id: currentUser.uid, ...currentUser }] : [];
                listNamaTeknisi = [];
                listNamaSaksi = currentUser && currentUser.role === 'User' ? [currentUser.nama] : [];
                populasikanDropdownNamaTandaTangan();
            }

            firestoreUnsubscribers.push(db.collection("dataAlat").onSnapshot(
                (querySnapshot) => {
                    dataAlat = [];
                    querySnapshot.forEach((doc) => dataAlat.push({ id: doc.id, ...doc.data() }));
                    dataAlat.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
                    aktualisasikanDotKoneksiHijau();
                    evaluasiJatuhTempoKalibrasiMassal();
                    renderEquipmentManagementTable();
                    renderRekapanPMTable();
                    renderRekapanEMTable();
                    jadwalkanRenderAll();
                    jadwalkanRekonsiliasiStatusAset();
                    if (dataAlatInitialSnapshotSudahDiproses) {
                        jadwalkanSinkronisasiEquipment(querySnapshot.docChanges());
                    } else {
                        dataAlatInitialSnapshotSudahDiproses = true;
                        updateBadgeEquipmentSync(`${dataAlat.length} aset siap`, 'ready');
                    }
                    populasikanDropdownAlatDiKalibrasi();
                    populasikanDropdownAlatDiWorksheet();
                    populasikanDropdownEtiketAlat();
                    // Panaskan cache QR saat browser idle agar saat tombol Cetak Label diklik
                    // QR tidak perlu dibuat satu per satu dari nol. Tidak memblokir UI utama.
                    medixWarmQrCache();

                },
                (error) => console.error("Listener dataAlat gagal:", error)
            ));

            firestoreUnsubscribers.push(db.collection("dataKalibrasi").onSnapshot(
                (querySnapshot) => {
                    dataKalibrasi = [];
                    querySnapshot.forEach((doc) => dataKalibrasi.push({ id: doc.id, ...doc.data() }));
                    evaluasiJatuhTempoKalibrasiMassal();
                    jadwalkanRenderAll();
                },
                (error) => console.error("Listener dataKalibrasi gagal:", error)
            ));

            let isFirstLoadTickets = true;
            const ticketQuery = currentActiveRole === 'User' && auth.currentUser
                ? db.collection("troubleTickets").where("pelaporUid", "==", auth.currentUser.uid)
                : db.collection("troubleTickets");

            firestoreUnsubscribers.push(ticketQuery.onSnapshot(
                (querySnapshot) => {
                    dataTiket = [];
                    querySnapshot.forEach((doc) => dataTiket.push({ id: doc.id, ...doc.data() }));

                    if (!isFirstLoadTickets) {
                        querySnapshot.docChanges().forEach((change) => {
                            if (change.type === "added" && (currentActiveRole === 'Admin' || currentActiveRole === 'Teknisi')) {
                                const audioAlert = document.getElementById('alarm-notifikasi-tiket');
                                if (audioAlert) audioAlert.play().catch(() => {});
                                const ticketData = change.doc.data();
                                showToast(`Laporan Kerusakan Baru: ${ticketData.keluhan || '-'}`, 'error');
                            }
                        });
                    }
                    isFirstLoadTickets = false;
                    renderDaftarTiketMasuk();
                    jadwalkanRekonsiliasiStatusAset();
                },
                (error) => {
                    console.error("Listener troubleTickets gagal:", error);
                    if (currentActiveRole === 'Admin' || currentActiveRole === 'Teknisi') {
                        showToast("Antrean laporan teknisi tidak dapat dimuat. Periksa Rules troubleTickets.", "error");
                    }
                }
            ));

            firestoreUnsubscribers.push(db.collection("bukuPetunjukAlat").onSnapshot(
                (querySnapshot) => {
                    dataBukuPetunjuk = [];
                    querySnapshot.forEach((doc) => dataBukuPetunjuk.push({ id: doc.id, ...doc.data() }));
                    if (globalSelectedAlatIdForLog) bukaKartuPemeliharaan(globalSelectedAlatIdForLog);
                },
                (error) => console.error("Listener bukuPetunjukAlat gagal:", error)
            ));

            const complaintLogQuery = currentActiveRole === 'User' && auth.currentUser
                ? db.collection("laporanKeluhanLog").where("pelaporUid", "==", auth.currentUser.uid)
                : db.collection("laporanKeluhanLog");

            firestoreUnsubscribers.push(complaintLogQuery.onSnapshot(
                (querySnapshot) => {
                    dataKeluhanLog = [];
                    querySnapshot.forEach((doc) => dataKeluhanLog.push({ id: doc.id, ...doc.data() }));
                    jadwalkanRenderAll();
                },
                (error) => console.error("Listener laporanKeluhanLog gagal:", error)
            ));

            firestoreUnsubscribers.push(db.collection("maintenance").onSnapshot(
                (querySnapshot) => {
                    dataMaintenance = [];
                    querySnapshot.forEach((doc) => dataMaintenance.push({ id: doc.id, ...doc.data() }));
                    renderRekapanEMTable();
                    renderMaintenanceHistory();
                },
                (error) => console.error("Listener maintenance gagal:", error)
            ));

            firestoreUnsubscribers.push(db.collection("lembarKerja").onSnapshot(
                (querySnapshot) => {
                    const dataLk = [];
                    querySnapshot.forEach((doc) => dataLk.push({ id: doc.id, ...doc.data() }));
                    dataLembarKerja = dataLk;
                    dataPerbaikan = dataLk.filter(d => d.jenisKerja === 'Corrective Maintenance').map(d => ({ ...d, desc: d.desc_kerja }));
                    dataPM = dataLk.filter(d => d.jenisKerja === 'Preventive Maintenance').map(d => ({ ...d, desc: d.desc_kerja }));
                    dataInspeksi = dataLk.filter(d => d.jenisKerja === 'Inspection').map(d => ({ ...d, desc: d.desc_kerja }));
                    jadwalkanRenderAll();
                    renderGrafikTrenKerusakan();
                    renderRekapanEMTable();
                    jadwalkanRekonsiliasiStatusAset();
        },
                (error) => console.error("Listener lembarKerja gagal:", error)
            ));
            firestoreUnsubscribers.push(db.collection('bhpItems').onSnapshot(
                (querySnapshot) => {
                    dataBHPItems = [];
                    querySnapshot.forEach(doc => dataBHPItems.push({ id: doc.id, ...doc.data() }));
                    dataBHPItems.sort((a,b) => String(a.namaItem||'').localeCompare(String(b.namaItem||''), 'id', {sensitivity:'base'}));
                    renderBHPTable();
                    renderBHPRecapLK();
                    populasikanDropdownBHPDiLK();
                    updateStats();
                },
                (error) => console.error('Listener bhpItems gagal:', error)
            ));
            firestoreUnsubscribers.push(db.collection('bhpTransactions').onSnapshot(
                (querySnapshot) => {
                    dataBHPTransactions = [];
                    querySnapshot.forEach(doc => dataBHPTransactions.push({ id: doc.id, ...doc.data() }));
                    renderBHPTable();
                    renderBHPRecapLK();
                    updateStats();
                },
                (error) => console.error('Listener bhpTransactions gagal:', error)
            ));
        }

        function gantiSubTabEM(tab) {
            currentEMSubTab = tab;

            const btnDb = document.getElementById('em-subtab-db');
            const btnJadwal = document.getElementById('em-subtab-jadwal');
            const btnRekapan = document.getElementById('em-subtab-rekapan');
            const contentDb = document.getElementById('em-content-database');
            const contentJadwal = document.getElementById('em-content-jadwal');
            const contentRekapan = document.getElementById('em-content-rekapan');

            if (!btnDb || !btnJadwal || !btnRekapan || !contentDb || !contentJadwal || !contentRekapan) return;

            [btnDb, btnJadwal, btnRekapan].forEach(btn => {
                btn.className = "px-4 py-2.5 rounded-lg flex-1 text-center transition text-slate-600";
            });
            [contentDb, contentJadwal, contentRekapan].forEach(content => content.classList.add('hidden'));

            const activeButton = tab === 'database' ? btnDb : tab === 'jadwal' ? btnJadwal : btnRekapan;
            const activeContent = tab === 'database' ? contentDb : tab === 'jadwal' ? contentJadwal : contentRekapan;

            activeButton.className = "px-4 py-2.5 rounded-lg flex-1 text-center bg-blue-600 text-white transition shadow-sm";
            activeContent.classList.remove('hidden');

            if (tab === 'database') {
                renderEquipmentManagementTable();
            } else if (tab === 'jadwal') {
                renderRekapanPMTable();
            } else {
                renderRekapanEMTable();
            }
        }

        // ============================================================
        // EQUIPMENT MANAGEMENT - OTOMATIS DARI MASTER DATA ASET
        // ============================================================
        // Master Data EM = agregasi otomatis dari collection dataAlat.
        // Setiap nama alat yang sama menjadi 1 baris EM dan jumlah unitnya
        // dihitung sebagai POPULASI. Jadwal PM tetap dibuat per unit agar
        // setiap serial number tetap dapat ditelusuri pada lembar kerja.

        // Profil EM di bawah ini mengikuti tabel EM WHO Rules / contoh Excel
        // yang diberikan. POPULASI bukan komponen penjumlahan EM karena rumus
        // sumber yang diberikan adalah: Fungsi + Risiko Fisik + Perawatan + Insiden.
        const EM_WHO_PROFIL_ALAT = {
            "AED": { fungsi: 10, risiko: 2, perawatan: 5, insiden: -2 },
            "Anesthesi Ventilator": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Auto Washer Desinfektor": { fungsi: 2, risiko: 4, perawatan: 5, insiden: -2 },
            "Baby CPAP": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Bed Elektrik": { fungsi: 2, risiko: 2, perawatan: 2, insiden: -2 },
            "Bio Safety Cabinet": { fungsi: 4, risiko: 4, perawatan: 3, insiden: -2 },
            "Blanket Warmer": { fungsi: 7, risiko: 4, perawatan: 5, insiden: -2 },
            "Blood Gas Analyzer": { fungsi: 5, risiko: 3, perawatan: 3, insiden: -2 },
            "Central Monitor": { fungsi: 6, risiko: 5, perawatan: 3, insiden: -2 },
            "Centrifuge": { fungsi: 4, risiko: 2, perawatan: 3, insiden: -2 },
            "CTG": { fungsi: 6, risiko: 3, perawatan: 5, insiden: -2 },
            "Defibrilator": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Diode Laser": { fungsi: 9, risiko: 5, perawatan: 5, insiden: -2 },
            "EEG": { fungsi: 7, risiko: 3, perawatan: 5, insiden: -2 },
            "EKG": { fungsi: 6, risiko: 3, perawatan: 5, insiden: -2 },
            "Electro Stimulator": { fungsi: 8, risiko: 4, perawatan: 5, insiden: 0 },
            "ENT Treatment Chair": { fungsi: 2, risiko: 2, perawatan: 2, insiden: -2 },
            "ENT Treatment Unit": { fungsi: 2, risiko: 2, perawatan: 2, insiden: -2 },
            "ESU": { fungsi: 9, risiko: 4, perawatan: 4, insiden: -1 },
            "Fetal Doppler": { fungsi: 6, risiko: 3, perawatan: 3, insiden: -2 },
            "Flat Panel Detector": { fungsi: 6, risiko: 2, perawatan: 3, insiden: -2 },
            "Freezer - Blood Plasma": { fungsi: 2, risiko: 2, perawatan: 2, insiden: -2 },
            "Glucometer": { fungsi: 3, risiko: 3, perawatan: 3, insiden: -1 },
            "Hematology Analyzer": { fungsi: 5, risiko: 3, perawatan: 5, insiden: 0 },
            "High Flow Nasal Canula": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "High Intensity Laser": { fungsi: 8, risiko: 4, perawatan: 5, insiden: -2 },
            "Immunology Analyzer": { fungsi: 6, risiko: 3, perawatan: 3, insiden: -2 },
            "Infant Incubator": { fungsi: 8, risiko: 5, perawatan: 5, insiden: -2 },
            "Infant Incubator Transport": { fungsi: 8, risiko: 5, perawatan: 5, insiden: -2 },
            "Infant Warmer": { fungsi: 8, risiko: 5, perawatan: 5, insiden: -2 },
            "Infusion Pump": { fungsi: 8, risiko: 5, perawatan: 5, insiden: -2 },
            "Infusion Warmer": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Kimia Analyzer": { fungsi: 5, risiko: 3, perawatan: 5, insiden: -2 },
            "Laminar Air Flow": { fungsi: 4, risiko: 2, perawatan: 3, insiden: -2 },
            "Micropipet Fix": { fungsi: 4, risiko: 2, perawatan: 1, insiden: -2 },
            "Micropipet Variable": { fungsi: 4, risiko: 2, perawatan: 1, insiden: -2 },
            "Mikroskop Binocular": { fungsi: 4, risiko: 2, perawatan: 2, insiden: -2 },
            "Nebulizer Compressor": { fungsi: 8, risiko: 4, perawatan: 5, insiden: -2 },
            "Nebulizer Ultrasonic": { fungsi: 8, risiko: 4, perawatan: 5, insiden: -2 },
            "Neo Resuscitator Transport": { fungsi: 8, risiko: 3, perawatan: 4, insiden: -2 },
            "NPWT": { fungsi: 8, risiko: 4, perawatan: 5, insiden: -2 },
            "Operating Lamp - Dual Arm": { fungsi: 2, risiko: 4, perawatan: 3, insiden: -2 },
            "Operating Lamp - Single Arm": { fungsi: 2, risiko: 4, perawatan: 3, insiden: -2 },
            "Orbital Shaker": { fungsi: 4, risiko: 2, perawatan: 2, insiden: -2 },
            "Oxygen Concentrator": { fungsi: 8, risiko: 5, perawatan: 5, insiden: -2 },
            "Patient Monitor": { fungsi: 7, risiko: 3, perawatan: 5, insiden: -2 },
            "Phototeraphy LED": { fungsi: 8, risiko: 4, perawatan: 4, insiden: -2 },
            "Phototeraphy TL": { fungsi: 7, risiko: 4, perawatan: 5, insiden: -2 },
            "Pulse Oxymeter": { fungsi: 6, risiko: 3, perawatan: 5, insiden: -2 },
            "Refrigerator Blood": { fungsi: 4, risiko: 2, perawatan: 2, insiden: -2 },
            "Refrigerator Farmasi": { fungsi: 4, risiko: 2, perawatan: 2, insiden: -2 },
            "Refrigerator Lab": { fungsi: 4, risiko: 2, perawatan: 2, insiden: -2 },
            "Roller Mixer": { fungsi: 4, risiko: 2, perawatan: 2, insiden: -2 },
            "Shock Wave Teraphy": { fungsi: 8, risiko: 4, perawatan: 5, insiden: -2 },
            "Shortwave Diathermy": { fungsi: 8, risiko: 4, perawatan: 3, insiden: -2 },
            "Spirometer": { fungsi: 6, risiko: 3, perawatan: 3, insiden: -2 },
            "Sterilizer - Plasma": { fungsi: 2, risiko: 4, perawatan: 5, insiden: -2 },
            "Sterilizer - Steam": { fungsi: 2, risiko: 4, perawatan: 5, insiden: 0 },
            "Sterilizer - UV & Ozone": { fungsi: 2, risiko: 2, perawatan: 2, insiden: -2 },
            "Suction Pump - high Vacuum": { fungsi: 7, risiko: 4, perawatan: 5, insiden: -2 },
            "Syringe Pump": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Tensimeter Manual": { fungsi: 6, risiko: 3, perawatan: 3, insiden: -1 },
            "Tensimeter Otomatis": { fungsi: 6, risiko: 3, perawatan: 5, insiden: -2 },
            "Thermohygrometer": { fungsi: 2, risiko: 1, perawatan: 1, insiden: -2 },
            "Timbangan Bayi": { fungsi: 2, risiko: 2, perawatan: 2, insiden: -2 },
            "Timbangan Dewasa": { fungsi: 2, risiko: 2, perawatan: 1, insiden: -2 },
            "Timbangan Obat": { fungsi: 4, risiko: 2, perawatan: 2, insiden: -2 },
            "Treadmill": { fungsi: 8, risiko: 5, perawatan: 5, insiden: -2 },
            "Ultrasound therapy": { fungsi: 8, risiko: 4, perawatan: 5, insiden: -2 },
            "Urine Analyzer": { fungsi: 5, risiko: 3, perawatan: 3, insiden: -2 },
            "USG - Echo": { fungsi: 6, risiko: 3, perawatan: 5, insiden: -2 },
            "USG - General": { fungsi: 6, risiko: 3, perawatan: 5, insiden: -2 },
            "USG - Obgyn": { fungsi: 6, risiko: 3, perawatan: 5, insiden: -2 },
            "Vein Finder": { fungsi: 2, risiko: 2, perawatan: 2, insiden: -2 },
            "Ventilator Adult / Pediatrik": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Ventilator Bayi": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Ventilator Transport Adult / Pediatrik": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Ventilator Transport Bayi": { fungsi: 10, risiko: 5, perawatan: 5, insiden: -2 },
            "Video Laryngoskop Adult": { fungsi: 2, risiko: 5, perawatan: 3, insiden: -2 },
            "Video Laryngoskop Adult+Pediatric": { fungsi: 2, risiko: 5, perawatan: 3, insiden: -2 },
            "Video Laryngoskop Pediatric": { fungsi: 2, risiko: 5, perawatan: 3, insiden: -2 },
            "Vital Sign Monitor": { fungsi: 7, risiko: 3, perawatan: 5, insiden: -2 },
            "Water Seal Drainage": { fungsi: 9, risiko: 5, perawatan: 5, insiden: -2 },
            "X-ray Dental Unit": { fungsi: 6, risiko: 4, perawatan: 5, insiden: -2 },
            "X-Ray Mobile": { fungsi: 6, risiko: 4, perawatan: 5, insiden: -2 },
            "X-ray Panoramic": { fungsi: 6, risiko: 4, perawatan: 5, insiden: -2 },
            "X-Ray Stationery": { fungsi: 6, risiko: 4, perawatan: 5, insiden: -2 },
            "Endoscopy - Bronchoscopy": { fungsi: 9, risiko: 4, perawatan: 5, insiden: -2 },
            "Infra Red Therapy": { fungsi: 8, risiko: 4, perawatan: 3, insiden: -2 },
            "Suction Pump - Low Vacuum": { fungsi: 7, risiko: 4, perawatan: 5, insiden: -2 },
            "Bed transfer": { fungsi: 2, risiko: 1, perawatan: 1, insiden: -2 },
            "Bed Emergency": { fungsi: 2, risiko: 1, perawatan: 1, insiden: -2 },
            "Audiometri Diagnostik": { fungsi: 6, risiko: 3, perawatan: 3, insiden: -2 },
            "Tympanometri": { fungsi: 6, risiko: 3, perawatan: 3, insiden: -2 },
            "Infusion Device Analyzer": { fungsi: 2, risiko: 2, perawatan: 3, insiden: -2 },
            "Laundry Clean Trolley": { fungsi: 2, risiko: 2, perawatan: 1, insiden: -2 },
        };

        const EM_WHO_RULES = {
            fungsi: {
                10: 'Life Support',
                9: 'Surgical & Intensive Care',
                8: 'Terapi Fisik & Treatment',
                7: 'Surgical & Intensive Care Monitoring',
                6: 'Additional Physiological Monitoring & Diagnostic',
                5: 'Analytical Laboratory',
                4: 'Laboratory Accessories',
                3: 'Computer & Related',
                2: 'Patient Related & Other'
            },
            risiko: {
                4: 'Potensi pasien atau petugas cedera',
                3: 'Kesalahan terapi atau diagnosa',
                2: 'Kerusakan peralatan',
                1: 'Risiko teridentifikasi tidak signifikan'
            },
            perawatan: {
                5: 'Intensive',
                4: 'Di atas rata-rata',
                3: 'Rata-rata',
                2: 'Di bawah rata-rata',
                1: 'Minimal'
            },
            insiden: {
                2: 'Signifikan',
                1: 'Di atas rata-rata',
                0: 'Rata-rata',
                '-1': 'Minimal',
                '-2': 'Tidak signifikan'
            }
        };

        // Tidak ada nilai fallback untuk penilaian EM.
        // Jika profil alat belum tersedia dan nilai manual belum diisi lengkap,
        // sistem menandai alat sebagai "Belum Dinilai" dan tidak membuat jadwal PM.

        function angkaAtauNull(...values) {
            for (const value of values) {
                if (value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value))) {
                    return Number(value);
                }
            }
            return null;
        }

        function normalisasiNamaEM(value) {
            return String(value ?? '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        }

        const EM_WHO_PROFIL_NORMALIZED = Object.fromEntries(
            Object.entries(EM_WHO_PROFIL_ALAT).map(([nama, nilai]) => [normalisasiNamaEM(nama), nilai])
        );

        function cariProfilEM(namaAlat) {
            const key = normalisasiNamaEM(namaAlat);
            if (EM_WHO_PROFIL_NORMALIZED[key]) return EM_WHO_PROFIL_NORMALIZED[key];

            // Beberapa nama pada master aset bisa mempunyai tambahan kata.
            // Pencocokan sebagian hanya dipakai jika nama WHO benar-benar menjadi
            // bagian dari nama aset agar tidak mengubah penilaian secara agresif.
            const kandidat = Object.keys(EM_WHO_PROFIL_NORMALIZED)
                .filter(k => k.length >= 4 && (key.includes(k) || k.includes(key)))
                .sort((a, b) => b.length - a.length);

            return kandidat.length ? EM_WHO_PROFIL_NORMALIZED[kandidat[0]] : null;
        }

        function hitungRekomendasiPeriodeWHO(nilaiEM) {
            if (nilaiEM === null || nilaiEM === undefined || Number.isNaN(Number(nilaiEM))) {
                return 'Belum Ditentukan';
            }

            const nilai = Number(nilaiEM);

            // Contoh Excel yang diberikan menetapkan nilai 12 sebagai
            // Satu Kali Per Tahun, sehingga batas operasional dipakai:
            // <=11 inspeksi, 12-14 tahunan, 15-19 6 bulanan, >=20 4 bulanan.
            if (nilai >= 20) return 'Setiap 4 Bulan';
            if (nilai >= 15) return 'Setiap 6 Bulan';
            if (nilai >= 12) return 'Satu Kali Per Tahun';
            return 'Inspeksi Sesuai Kebutuhan';
        }

        function kelasBadgePeriodeEM(periode) {
            if (periode === 'Setiap 4 Bulan') return 'bg-rose-100 text-rose-700';
            if (periode === 'Setiap 6 Bulan') return 'bg-orange-100 text-orange-700';
            if (periode === 'Satu Kali Per Tahun') return 'bg-amber-100 text-amber-700';
            if (periode === 'Inspeksi Sesuai Kebutuhan') return 'bg-emerald-100 text-emerald-700';
            return 'bg-slate-100 text-slate-600';
        }

        function kelasBadgePeriodeEMGelap(periode) {
            if (periode === 'Setiap 4 Bulan') return 'bg-rose-600';
            if (periode === 'Setiap 6 Bulan') return 'bg-orange-600';
            if (periode === 'Satu Kali Per Tahun') return 'bg-amber-600';
            if (periode === 'Inspeksi Sesuai Kebutuhan') return 'bg-emerald-600';
            return 'bg-slate-600';
        }

        function tanggalValidDariAsset(asset = {}, tahunArg = null) {
            // Tanggal acuan PM tidak lagi menjadi input manual. Jadwal PM diturunkan
            // otomatis dari periode EM dengan awal siklus Januari pada tahun terpilih.
            const tahun = Number(tahunArg) || new Date().getFullYear();
            return new Date(tahun, 0, 1);
        }

        function tambahBulanTanggal(baseDate, months) {
            const d = new Date(baseDate);
            const originalDay = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() + months);
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(originalDay, lastDay));
            return d;
        }

        function formatTanggalISO(date) {
            if (!(date instanceof Date) || isNaN(date.getTime())) return '';
            return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        }

        function jadwalOtomatisDariPeriode(periode, assetIndex = 0, asset = {}, tahunArg = null) {
            const acuan = tanggalValidDariAsset(asset, tahunArg);
            if (!acuan) return [];

            const interval = periode === 'Setiap 4 Bulan' ? 4 : periode === 'Setiap 6 Bulan' ? 6 : periode === 'Satu Kali Per Tahun' ? 12 : 0;
            if (!interval) return [];

            return Array.from({ length: Math.floor(12 / interval) }, (_, i) => {
                const tanggal = tambahBulanTanggal(acuan, interval * (i + 1));
                return {
                    tanggal: formatTanggalISO(tanggal),
                    hari: tanggal.getDate(),
                    bulan: tanggal.getMonth() + 1,
                    tahun: tanggal.getFullYear()
                };
            });
        }

        function normalisasiAssetUntukEquipment(asset, index = 0, existing = {}) {
            const kodeAlat =
                asset.kodeAlat || asset.kodeAset || asset.kode || asset.assetCode || asset.nomorAset || asset.id;
            const namaAlat = asset.nama || asset.namaAlat || 'Alat Medis';
            const merk = asset.merk || asset.brand || '-';
            const tipe = asset.tipe || asset.model || asset.modelTipe || '-';
            const serialNumber = asset.seri || asset.serialNumber || asset.sn || '-';
            const lokasi = asset.ruangan || asset.lokasi || asset.unit || 'Unit';
            const status = asset.status || existing.status || 'Siap Digunakan';
            const profilWHO = cariProfilEM(namaAlat);

            // Prioritas sumber nilai: nilai manual pada Master Aset -> profil alat -> data lama.
            // Tidak ada nilai fallback; alat tanpa penilaian lengkap tidak boleh
            // mendapatkan rekomendasi periode PM secara otomatis.
            const fungsi = angkaAtauNull(asset.emFungsi, asset.kategoriFungsi, asset.KATEGORIFUNGSI, profilWHO?.fungsi, existing.emFungsi);
            const risiko = angkaAtauNull(asset.emRisiko, asset.tingkatRisiko, asset.TINGKATRISIKO, profilWHO?.risiko, existing.emRisiko);
            const perawatan = angkaAtauNull(asset.emPerawatan, asset.levelPerawatan, asset.LEVELPERAWATAN, profilWHO?.perawatan, existing.emPerawatan);
            const insiden = angkaAtauNull(asset.emInsiden, asset.riwayatInsiden, asset.RIWAYATINSIDEN, profilWHO?.insiden, existing.emInsiden);

            const komponenLengkap = [fungsi, risiko, perawatan, insiden].every(v => v !== null);
            const nilaiEM = komponenLengkap ? fungsi + risiko + perawatan + insiden : null;
            const rekomendasiPeriode = hitungRekomendasiPeriodeWHO(nilaiEM);
            const jadwalPM = jadwalOtomatisDariPeriode(rekomendasiPeriode, index, asset);
            const jadwalPertama = jadwalPM[0] || {};
            const teknisi = asset.teknisi || asset.penanggungJawab || existing.teknisi || 'Teknisi';

            return {
                assetId: asset.id,
                sumberData: 'dataAlat',
                sumberEM: profilWHO ? 'Profil EM bawaan aplikasi' : (komponenLengkap ? 'Penilaian manual / data lama' : 'Belum Dinilai'),
                kodeAlat,
                namaAlat,
                merk,
                tipe,
                serialNumber,
                lokasi,
                kategori: asset.kategori || asset.jenis || existing.kategori || '',
                unit: asset.unit || asset.ruangan || existing.unit || '',
                izinEdar: asset.izinEdar || asset.edar || existing.izinEdar || '',
                teknisi,
                status,
                kondisi: status === 'Dalam Perbaikan' ? 'Kurang Baik' : (existing.kondisi || 'Baik'),
                emFungsi: fungsi,
                emRisiko: risiko,
                emPerawatan: perawatan,
                emInsiden: insiden,
                nilaiEM,
                rekomendasiPeriode,
                jadwalPM,
                jadwalBerbasisTanggal: jadwalPM.length > 0,
                statusJadwalPM: !komponenLengkap ? 'Belum Dinilai' : 'Terjadwal Otomatis',
                hari: jadwalPertama.hari || null,
                bulan: jadwalPertama.bulan || null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
        }

        function kelompokkanDataEquipmentUntukEM(assets, existingMap = {}) {
            const groups = new Map();

            (assets || []).forEach((asset, index) => {
                if (!asset || !asset.id) return;
                const existing = existingMap[asset.id] || {};
                const item = { id: asset.id, ...normalisasiAssetUntukEquipment(asset, index, existing) };
                const key = normalisasiNamaEM(item.namaAlat);

                if (!groups.has(key)) {
                    groups.set(key, {
                        id: 'em-' + key.replace(/\s+/g, '-'),
                        namaAlat: item.namaAlat,
                        merkSet: new Set(),
                        tipeSet: new Set(),
                        lokasiSet: new Set(),
                        teknisiSet: new Set(),
                        serialSet: new Set(),
                        assets: [],
                        emFungsi: item.emFungsi,
                        emRisiko: item.emRisiko,
                        emPerawatan: item.emPerawatan,
                        emInsiden: item.emInsiden,
                        nilaiEM: item.nilaiEM,
                        rekomendasiPeriode: item.rekomendasiPeriode,
                        sumberEM: item.sumberEM
                    });
                }

                const group = groups.get(key);
                group.assets.push(item);
                if (item.merk && item.merk !== '-') group.merkSet.add(item.merk);
                if (item.tipe && item.tipe !== '-') group.tipeSet.add(item.tipe);
                if (item.lokasi) group.lokasiSet.add(item.lokasi);
                if (item.teknisi) group.teknisiSet.add(item.teknisi);
                if (item.serialNumber && item.serialNumber !== '-') group.serialSet.add(item.serialNumber);
            });

            return Array.from(groups.values()).map(group => {
                // Karena satu nama alat dapat memiliki lebih dari satu profil jika
                // Master Aset sangat heterogen, gunakan profil mayoritas/pertama yang
                // tersedia. Untuk kondisi normal semua unit nama yang sama memiliki skor sama.
                const nilaiKomponen = group.assets.map(a => [a.emFungsi, a.emRisiko, a.emPerawatan, a.emInsiden]);
                const konsisten = nilaiKomponen.every(v => JSON.stringify(v) === JSON.stringify(nilaiKomponen[0]));
                const base = group.assets[0] || {};
                const fungsi = konsisten ? base.emFungsi : angkaAtauNull(...group.assets.map(a => a.emFungsi));
                const risiko = konsisten ? base.emRisiko : angkaAtauNull(...group.assets.map(a => a.emRisiko));
                const perawatan = konsisten ? base.emPerawatan : angkaAtauNull(...group.assets.map(a => a.emPerawatan));
                const insiden = konsisten ? base.emInsiden : angkaAtauNull(...group.assets.map(a => a.emInsiden));
                const nilaiEM = [fungsi, risiko, perawatan, insiden].every(v => v !== null) ? fungsi + risiko + perawatan + insiden : null;

                return {
                    ...group,
                    populasi: group.assets.length,
                    satuan: 'Unit',
                    merk: Array.from(group.merkSet).join(', ') || '-',
                    tipe: Array.from(group.tipeSet).join(', ') || '-',
                    lokasi: Array.from(group.lokasiSet).join(', ') || '-',
                    teknisi: Array.from(group.teknisiSet).join(', ') || '-',
                    serialNumbers: Array.from(group.serialSet),
                    emFungsi: fungsi,
                    emRisiko: risiko,
                    emPerawatan: perawatan,
                    emInsiden: insiden,
                    nilaiEM,
                    rekomendasiPeriode: hitungRekomendasiPeriodeWHO(nilaiEM),
                    sumberEM: konsisten ? (base.sumberEM || 'EM WHO Rules') : 'Profil campuran - perlu verifikasi'
                };
            }).sort((a, b) => a.namaAlat.localeCompare(b.namaAlat, 'id'));
        }


function updateBadgeEquipmentSync(text, mode = 'ready') {
            const badge = document.getElementById('equipment-sync-badge');
            if (!badge) return;
            badge.style.display = 'none';
            const styles = {
                ready: 'inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-[10px] font-bold',
                sync: 'inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl text-[10px] font-bold',
                error: 'inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-2 rounded-xl text-[10px] font-bold'
            };
            const icon = mode === 'sync' ? '<i class="fa-solid fa-arrows-rotate fa-spin"></i>' : mode === 'error' ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-circle-check"></i>';
            badge.innerHTML = `${icon} ${escapeHtmlEquipment(text)}`;
            badge.className = styles[mode] || styles.ready;
        }

        function jadwalkanSinkronisasiEquipment(changes = []) {
            // User tidak memiliki akses Equipment Management maupun koleksi equipment.
            if (currentActiveRole !== 'Admin' && currentActiveRole !== 'Teknisi') return;
            if (!Array.isArray(changes) || changes.length === 0) return;
            changes.forEach(change => {
                if (change?.doc?.id) equipmentSyncQueue.set(change.doc.id, change);
            });
            if (equipmentSyncTimer) return;
            equipmentSyncTimer = setTimeout(async () => {
                equipmentSyncTimer = null;
                const queued = Array.from(equipmentSyncQueue.values());
                equipmentSyncQueue.clear();
                await sinkronisasiEquipmentPerubahan(queued);
            }, 250);
        }

        async function sinkronisasiEquipmentPerubahan(changes = []) {
            if (!db || !Array.isArray(changes) || changes.length === 0) return;
            const relevant = changes.filter(change => ['added', 'modified', 'removed'].includes(change.type));
            if (relevant.length === 0) return;
            updateBadgeEquipmentSync(`Menyinkronkan ${relevant.length} perubahan...`, 'sync');
            try {
                const batch = db.batch();
                const collection = db.collection('equipment');
                const upserts = relevant.filter(change => change.type !== 'removed');
                const existingPairs = await Promise.all(upserts.map(async change => {
                    const ref = collection.doc(change.doc.id);
                    try {
                        const snap = await ref.get();
                        return [change.doc.id, snap.exists ? { id: snap.id, ...snap.data() } : {}];
                    } catch (error) {
                        return [change.doc.id, {}];
                    }
                }));
                const existingMap = Object.fromEntries(existingPairs);
                upserts.forEach((change, index) => {
                    const asset = { id: change.doc.id, ...change.doc.data() };
                    const existing = existingMap[change.doc.id] || {};
                    const payload = normalisasiAssetUntukEquipment(asset, index, existing);
                    batch.set(collection.doc(change.doc.id), {
                        ...payload,
                        createdAt: existing.createdAt || firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                });
                relevant.filter(change => change.type === 'removed').forEach(change => batch.delete(collection.doc(change.doc.id)));
                await batch.commit();
                updateBadgeEquipmentSync(`${dataAlat.length} aset siap`, 'ready');
            } catch (error) {
                console.error('Sinkronisasi perubahan equipment gagal:', error);
                updateBadgeEquipmentSync(`${dataAlat.length} aset siap • cache`, 'error');
            }
        }

        function bukaEMDenganFilter(periode = 'all') {
            window.medixEMQuickFilter = periode || 'all';
            gantiSubTabEM('database');
            renderEquipmentManagementTable();
            const area = document.getElementById('tab-equipment');
            if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (periode && periode !== 'all') {
                showToast('Menampilkan alat dengan rekomendasi: ' + periode, 'success');
            }
        }

        async function renderEquipmentManagementTable() {
            try {
                if (!Array.isArray(dataAlat)) dataAlat = [];
                // Isi otomatis EM yang belum ada berdasarkan profil EM yang sudah menjadi sumber penilaian Equipment Management.
                await sinkronkanEMMasterDariProfil();
                dataEquipment = dataAlat.map((asset, index) => ({ id: asset.id, ...normalisasiAssetUntukEquipment(asset, index, {}) }));
                const groups = kelompokkanDataEquipmentUntukEM(dataAlat, {});
                window.dataEMGroups = groups;
                const totalJenis = groups.length;
                const totalPopulasi = groups.reduce((sum, g) => sum + g.populasi, 0);
                const empatBulan = groups.filter(g => g.rekomendasiPeriode === 'Setiap 4 Bulan').length;
                const enamBulan = groups.filter(g => g.rekomendasiPeriode === 'Setiap 6 Bulan').length;
                const tahunan = groups.filter(g => g.rekomendasiPeriode === 'Satu Kali Per Tahun').length;
                const inspeksi = groups.filter(g => g.rekomendasiPeriode === 'Inspeksi Sesuai Kebutuhan').length;
                document.getElementById('em-stat-total')?.replaceChildren(document.createTextNode(totalJenis));
                document.getElementById('em-stat-populasi')?.replaceChildren(document.createTextNode(totalPopulasi));
                document.getElementById('em-stat-empat')?.replaceChildren(document.createTextNode(empatBulan));
                document.getElementById('em-stat-enam')?.replaceChildren(document.createTextNode(enamBulan));
                document.getElementById('em-stat-satu')?.replaceChildren(document.createTextNode(tahunan));
                document.getElementById('em-stat-inspeksi')?.replaceChildren(document.createTextNode(inspeksi));
                const quickFilter = window.medixEMQuickFilter || 'all';
                const filtered = quickFilter === 'all' ? groups : groups.filter(g => g.rekomendasiPeriode === quickFilter);
                const tbody = document.getElementById('table-equipment-em-body');
                if (!tbody) return;
                if (filtered.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="10" class="px-4 py-10 text-center text-slate-400 italic">${groups.length === 0 ? 'Belum ada aset pada Master Data Aset.' : 'Pencarian atau filter tidak menemukan data.'}</td></tr>`;
                    return;
                }
                tbody.innerHTML = filtered.map(item => `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-3"><div class="font-bold text-slate-900">${escapeHtmlEquipment(item.namaAlat || '-')}</div><div class="text-[10px] font-mono text-cyan-600">${item.populasi} unit terdaftar</div><div class="text-[9px] text-slate-400">${escapeHtmlEquipment(item.merk || '-')}${item.tipe && item.tipe !== '-' ? ' • ' + escapeHtmlEquipment(item.tipe) : ''}</div></td>
                        <td class="p-3 text-center"><span class="inline-flex min-w-[42px] justify-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 font-black">${item.populasi}</span></td>
                        <td class="p-3 text-center font-bold text-slate-700">${item.satuan}</td>
                        <td class="p-3 text-center font-bold text-slate-700">${item.emFungsi ?? '-'}</td>
                        <td class="p-3 text-center font-bold text-slate-700">${item.emRisiko ?? '-'}</td>
                        <td class="p-3 text-center font-bold text-slate-700">${item.emPerawatan ?? '-'}</td>
                        <td class="p-3 text-center font-bold text-slate-700">${item.emInsiden ?? '-'}</td>
                        <td class="p-3 text-center font-black text-blue-600 text-sm">${item.nilaiEM ?? '-'}</td>
                        <td class="p-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold medix-period-badge ${kelasBadgePeriodeEM(item.rekomendasiPeriode)} ${item.rekomendasiPeriode === 'Setiap 4 Bulan' ? 'period-4' : item.rekomendasiPeriode === 'Setiap 6 Bulan' ? 'period-6' : item.rekomendasiPeriode === 'Satu Kali Per Tahun' ? 'period-12' : 'period-inspeksi'}">${escapeHtmlEquipment(item.rekomendasiPeriode || '-')}</span></td>
                        <td class="p-3"><div class="font-semibold text-slate-800">${escapeHtmlEquipment(item.lokasi || '-')}</div><div class="text-[10px] text-slate-400">${escapeHtmlEquipment(item.teknisi || '-')}</div></td>
                    </tr>`).join('');
            } catch (error) {
                console.error('Gagal merender tabel equipment:', error);
                showToast('Gagal menampilkan Equipment Management: ' + error.message, 'error');
            }
        }

                function escapeHtmlEquipment(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function getJadwalPMUntukAsset(item, index = 0, tahunArg = null) {
            return jadwalOtomatisDariPeriode(item.rekomendasiPeriode, index, item, tahunArg);
        }

        function inisialisasiFilterRekapanPM(){
            const sel=document.getElementById('filter-rekapan-pm-tahun');
            if(!sel)return;
            const old=sel.value;
            const years=new Set([new Date().getFullYear()]);
            (Array.isArray(dataEquipment)?dataEquipment:[]).forEach((item,index)=>{
                const dates=getJadwalPMUntukAsset(item,index)||[];
                dates.forEach(j=>{
                    if(j?.tahun)years.add(Number(j.tahun));
                });
            });
            sel.innerHTML=Array.from(years).filter(Boolean).sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join('');
            sel.value=years.has(Number(old))?old:String(new Date().getFullYear());
            const bulan=document.getElementById('filter-rekapan-pm-bulan');
            if(bulan && !bulan.value)bulan.value=String(new Date().getMonth());
        }

        function exportRekapanPMExcel(mode='year'){
            if(typeof XLSX==='undefined'){showToast('Library Excel belum tersedia.','error');return;}
            inisialisasiFilterRekapanPM();
            const year=Number(document.getElementById('filter-rekapan-pm-tahun')?.value)||new Date().getFullYear();
            const month=Number(document.getElementById('filter-rekapan-pm-bulan')?.value)||0;
            const namaBulan=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
            const rows=[];
            (Array.isArray(dataEquipment)?dataEquipment:[]).forEach((item,index)=>{
                const jadwal=getJadwalPMUntukAsset(item,index,year)||[];
                const inYear=jadwal.filter(j=>Number(j?.tahun)===year);
                const inMonth=inYear.filter(j=>Number(j?.bulan)===month+1);
                if(mode==='month' && !inMonth.length)return;
                const merk=item.merk||'-', tipe=item.tipe||item.model||'-', sn=item.serialNumber||item.seri||'-', lokasi=item.lokasi||item.ruangan||'-';
                rows.push({
                    "No":rows.length+1,
                    "Nama Alat Medis":item.namaAlat||'-',
                    "Merek":merk,
                    "Tipe / Model":tipe,
                    "SN":sn,
                    "Ruangan":lokasi,
                    "Periode PM":item.rekomendasiPeriode||'Belum Ditentukan',
                    "Tanggal Jadwal":(mode==='month'?inMonth:inYear).map(j=>j.tanggal||'-').join(', ')||'-'
                });
            });
            const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Informasi":`Tidak ada jadwal PM untuk ${mode==='month'?namaBulan[month]+' ':''}${year}.`}]);
            const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Jadwal PM');
            const suffix=mode==='month'?`${year}-${String(month+1).padStart(2,'0')}`:String(year);
            XLSX.writeFile(wb,`Rekapan_Jadwal_PM_${suffix}.xlsx`);
            showToast(`Rekapan Jadwal PM ${mode==='month'?namaBulan[month]+' ':''}${year} berhasil diunduh (${rows.length} aset).`,'success');
        }

        function renderRekapanPMTable() {
            inisialisasiFilterRekapanPM();
            const tbody = document.getElementById('table-rekapan-pm-body');
            if (!tbody) return;

            // Jadwal EM/PM ditampilkan satu baris per unit aset.
            // Hari ke-/bulan ke- tidak lagi ditampilkan karena periode PM
            // sudah menjadi informasi utama yang dibutuhkan teknisi.
            const rows = dataEquipment.map(item => ({
                item,
                periode: item.rekomendasiPeriode || 'Belum Ditentukan',
                statusJadwalPM: item.statusJadwalPM || (item.nilaiEM == null ? 'Belum Dinilai' : 'Terjadwal Otomatis')
            }));

            rows.sort((a, b) =>
                (a.item.namaAlat || '').localeCompare(b.item.namaAlat || '', 'id') ||
                (a.item.serialNumber || '').localeCompare(b.item.serialNumber || '', 'id')
            );

const filtered = rows;

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-10 text-center text-slate-400 italic">Belum ada data jadwal PM dari Master Data Aset.</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(row => {
                const item = row.item || {};
                const merk = item.merk || '-';
                const tipe = item.tipe || item.model || '-';
                const sn = item.serialNumber || item.seri || '-';
                const lokasi = item.lokasi || item.ruangan || '-';
                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-3 font-semibold text-slate-900" data-label="Nama Alat Medis">${escapeHtmlEquipment(item.namaAlat || '-')}</td>
                        <td class="p-3" data-label="Merek">${escapeHtmlEquipment(merk)}</td>
                        <td class="p-3" data-label="Tipe / Model">${escapeHtmlEquipment(tipe)}</td>
                        <td class="p-3 font-mono text-[10px]" data-label="SN">${escapeHtmlEquipment(sn)}</td>
                        <td class="p-3" data-label="Ruangan">${escapeHtmlEquipment(lokasi)}</td>
                        <td class="p-3" data-label="Periode PM"><span class="px-2 py-1 rounded-full text-[9px] font-bold medix-period-badge ${kelasBadgePeriodeEM(row.periode)} ${row.periode === 'Setiap 4 Bulan' ? 'period-4' : row.periode === 'Setiap 6 Bulan' ? 'period-6' : row.periode === 'Satu Kali Per Tahun' ? 'period-12' : 'period-inspeksi'}">${escapeHtmlEquipment(row.periode)}</span></td>
                    </tr>
                `;
            }).join('');
        }

        // ============================================================
        // REKAPAN EM - TARGET VS REALISASI PEMELIHARAAN
        // ============================================================
        // Rekapan dibuat dari dua sumber aktivitas:
        // 1) lembarKerja = LK yang benar-benar dibuat melalui Lembar Kerja.
        // 2) maintenance = histori pemeliharaan manual.
        //
        // Target berasal dari jadwal EM/PM per unit:
        // 4 bulan = 3 target/tahun, 6 bulan = 2, 12 bulan = 1,
        // inspeksi sesuai kebutuhan = 0.
        //
        // Jika LK dan maintenance tercatat untuk alat yang sama pada tanggal
        // yang sama, aktivitas dihitung satu kali agar tidak menggandakan
        // realisasi.

        function inisialisasiFilterTahunRekapanEM() {
            const select = document.getElementById('filter-rekapan-em-tahun');
            if (!select) return;

            const tahunSekarang = new Date().getFullYear();
            const tahunData = new Set([tahunSekarang]);

            [...dataLembarKerja, ...dataMaintenance].forEach(item => {
                const d = tanggalRekapanEM(item);
                if (d) tahunData.add(d.getFullYear());
            });

            const tahunTerpilih = parseInt(select.value, 10);
            const years = [...tahunData].filter(Number.isFinite).sort((a, b) => b - a);

            select.innerHTML = years.map(tahun =>
                `<option value="${tahun}">${tahun}</option>`
            ).join('');

            if (years.includes(tahunTerpilih)) {
                select.value = String(tahunTerpilih);
            } else {
                select.value = String(tahunSekarang);
            }
        }

        function tanggalRekapanEM(item) {
            const raw = item?.textTgl || item?.tanggal || item?.tgl || item?.date || item?.createdAt;
            if (!raw) return null;

            if (raw?.toDate && typeof raw.toDate === 'function') {
                const d = raw.toDate();
                return isNaN(d.getTime()) ? null : d;
            }

            if (raw instanceof Date) {
                return isNaN(raw.getTime()) ? null : raw;
            }

            const d = new Date(raw);
            return isNaN(d.getTime()) ? null : d;
        }

        function idAlatRekapanEM(item) {
            return String(
                item?.alatId ||
                item?.equipmentId ||
                item?.idAlat ||
                item?.assetId ||
                ''
            ).trim();
        }

        function namaAlatRekapanEM(item) {
            return String(
                item?.namaAlat ||
                item?.nama ||
                item?.alatNama ||
                ''
            ).trim();
        }

        function normalisasiTanggalRekapanEM(item) {
            const d = tanggalRekapanEM(item);
            if (!d) return '';
            return [
                d.getFullYear(),
                String(d.getMonth() + 1).padStart(2, '0'),
                String(d.getDate()).padStart(2, '0')
            ].join('-');
        }

        function ambilAktivitasRekapanEM(tahun) {
            const sumber = [];

            dataLembarKerja.forEach(item => {
                const tanggal = tanggalRekapanEM(item);
                if (!tanggal || tanggal.getFullYear() !== tahun) return;

                sumber.push({
                    source: 'LK',
                    id: item.id,
                    alatId: idAlatRekapanEM(item),
                    namaAlat: namaAlatRekapanEM(item),
                    tanggal,
                    jenis: item.jenisKerja || 'LK',
                    noLk: item.noLk || ''
                });
            });

            dataMaintenance.forEach(item => {
                const tanggal = tanggalRekapanEM(item);
                if (!tanggal || tanggal.getFullYear() !== tahun) return;

                sumber.push({
                    source: 'Maintenance',
                    id: item.id,
                    alatId: idAlatRekapanEM(item),
                    namaAlat: namaAlatRekapanEM(item),
                    tanggal,
                    jenis: item.jenis || 'Maintenance',
                    noLk: ''
                });
            });

            // Jika alatId tersedia, deduplikasi LK + maintenance pada alat/tanggal
            // yang sama. LK diprioritaskan sebagai catatan resmi.
            const byKey = new Map();
            const tanpaId = [];

            sumber.forEach(item => {
                const tanggalKey = normalisasiTanggalRekapanEM(item);
                const alatKey = item.alatId || normalisasiNamaEM(item.namaAlat || 'tanpa-nama');

                if (!alatKey || alatKey === 'tanpa-nama') {
                    tanpaId.push(item);
                    return;
                }

                const key = `${alatKey}|${tanggalKey}`;
                const existing = byKey.get(key);

                if (!existing || (item.source === 'LK' && existing.source !== 'LK')) {
                    byKey.set(key, item);
                }
            });

            return [...byKey.values(), ...tanpaId];
        }

        function cariAssetUntukRekapanEM(aktivitas) {
            if (aktivitas.alatId) {
                const byId = dataEquipment.find(item => String(item.id) === String(aktivitas.alatId));
                if (byId) return byId;

                const byAssetId = dataEquipment.find(item =>
                    String(item.assetId || item.alatId || '') === String(aktivitas.alatId)
                );
                if (byAssetId) return byAssetId;
            }

            const namaNormal = normalisasiNamaEM(aktivitas.namaAlat || '');
            if (!namaNormal) return null;

            return dataEquipment.find(item =>
                normalisasiNamaEM(item.namaAlat || '') === namaNormal
            ) || null;
        }

        function buatDataRekapanEM(tahun) {
            const groups = new Map();

            // Semua alat dari Master Data Aset harus tetap muncul meskipun
            // belum pernah dilakukan pemeliharaan.
            dataEquipment.forEach((asset, index) => {
                const key = normalisasiNamaEM(asset.namaAlat || `tanpa-nama-${index}`);
                if (!key) return;

                if (!groups.has(key)) {
                    groups.set(key, {
                        namaAlat: asset.namaAlat || '-',
                        populasi: 0,
                        target: 0,
                        selesai: 0,
                        bulan: Array(12).fill(0),
                        periode: asset.rekomendasiPeriode || 'Inspeksi Sesuai Kebutuhan',
                        assets: []
                    });
                }

                const group = groups.get(key);
                group.populasi += 1;
                group.assets.push(asset);

                const periode = asset.rekomendasiPeriode || '';
                const targetPerTahun = periode === 'Setiap 4 Bulan' ? 3
                    : periode === 'Setiap 6 Bulan' ? 2
                    : periode === 'Satu Kali Per Tahun' ? 1
                    : 0;
                group.target += targetPerTahun;
            });

            // Realisasi: LK + maintenance pada tahun terpilih.
            ambilAktivitasRekapanEM(tahun).forEach(aktivitas => {
                let asset = cariAssetUntukRekapanEM(aktivitas);
                const nama = asset?.namaAlat || aktivitas.namaAlat || '-';
                const key = normalisasiNamaEM(nama);

                if (!key) return;

                if (!groups.has(key)) {
                    groups.set(key, {
                        namaAlat: nama,
                        populasi: 0,
                        target: 0,
                        selesai: 0,
                        bulan: Array(12).fill(0),
                        periode: asset?.rekomendasiPeriode || 'Inspeksi Sesuai Kebutuhan',
                        assets: []
                    });
                }

                const group = groups.get(key);
                group.selesai += 1;
                const bulan = aktivitas.tanggal.getMonth();
                if (bulan >= 0 && bulan < 12) group.bulan[bulan] += 1;

                if (asset && !group.assets.some(a => a.id === asset.id)) {
                    group.assets.push(asset);
                }
            });

            return [...groups.values()].sort((a, b) =>
                a.namaAlat.localeCompare(b.namaAlat, 'id')
            );
        }

        function statusRekapanEM(target, selesai) {
            if (target === 0 && selesai === 0) {
                return {
                    text: 'Belum ada pelaksanaan terjadwal',
                    cls: 'bg-slate-100 text-slate-500'
                };
            }
            if (selesai === 0) {
                return {
                    text: 'Belum ada pelaksanaan',
                    cls: 'bg-rose-50 text-rose-700'
                };
            }
            if (selesai >= target && target > 0) {
                return {
                    text: selesai > target ? 'Melebihi target' : 'Target tercapai',
                    cls: selesai > target ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                };
            }
            return {
                text: 'Masih ada target',
                cls: 'bg-amber-50 text-amber-700'
            };
        }

        function renderRekapanEMTable() {
            const tbody = document.getElementById('table-rekapan-em-body');
            const tfoot = document.getElementById('table-rekapan-em-foot');
            if (!tbody) return;

            inisialisasiFilterTahunRekapanEM();

            const tahun = parseInt(document.getElementById('filter-rekapan-em-tahun')?.value, 10) || new Date().getFullYear();
            const allRows = buatDataRekapanEM(tahun);
            const rows = allRows;

            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="19" class="px-4 py-10 text-center text-slate-400 italic">Belum ada data Rekapan EM.</td></tr>`;
                if (tfoot) tfoot.innerHTML = '';
                return;
            }

            let totalPopulasi = 0;
            let totalTarget = 0;
            let totalSelesai = 0;
            const totalBulan = Array(12).fill(0);

            tbody.innerHTML = rows.map((row, index) => {
                const sisa = row.target - row.selesai;
                const status = statusRekapanEM(row.target, row.selesai);

                totalPopulasi += row.populasi;
                totalTarget += row.target;
                totalSelesai += row.selesai;
                row.bulan.forEach((value, i) => totalBulan[i] += value);

                const bulanCells = row.bulan.map(value =>
                    `<td class="p-2 text-center font-bold ${value > 0 ? 'text-blue-700' : 'text-slate-300'}">${value}</td>`
                ).join('');

                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-2 text-center font-bold text-slate-500">${index + 1}</td>
                        <td class="p-2 font-semibold text-slate-900">${escapeHtmlEquipment(row.namaAlat)}</td>
                        <td class="p-2 text-center font-bold">${row.populasi}</td>
                        <td class="p-2 text-center font-bold text-blue-700">${row.target}</td>
                        <td class="p-2 text-center font-bold text-emerald-700">${row.selesai}</td>
                        <td class="p-2 text-center font-bold ${sisa < 0 ? 'text-blue-700' : sisa === 0 ? 'text-emerald-700' : 'text-rose-700'}">${sisa}</td>
                        ${bulanCells}
                        <td class="p-2">
                            <span class="inline-flex px-2 py-1 rounded-lg text-[9px] font-bold ${status.cls}">
                                ${escapeHtmlEquipment(status.text)}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');

            if (tfoot) {
                const totalSisa = totalTarget - totalSelesai;
                tfoot.innerHTML = `
                    <tr>
                        <td colspan="2" class="p-3 text-right">TOTAL</td>
                        <td class="p-3 text-center">${totalPopulasi}</td>
                        <td class="p-3 text-center text-blue-700">${totalTarget}</td>
                        <td class="p-3 text-center text-emerald-700">${totalSelesai}</td>
                        <td class="p-3 text-center ${totalSisa < 0 ? 'text-blue-700' : totalSisa === 0 ? 'text-emerald-700' : 'text-rose-700'}">${totalSisa}</td>
                        ${totalBulan.map(value => `<td class="p-3 text-center">${value}</td>`).join('')}
                        <td class="p-3 text-center">${totalSelesai >= totalTarget && totalTarget > 0 ? 'Target tercapai' : 'Monitoring'}</td>
                    </tr>
                `;
            }
        }

        function exportRekapanEMExcel(mode='year') {
            if (typeof XLSX === 'undefined') {
                showToast('Library Excel belum tersedia.', 'error');
                return;
            }

            const tahun = parseInt(document.getElementById('filter-rekapan-em-tahun')?.value, 10) || new Date().getFullYear();
            const bulanIndex = Math.max(0, Math.min(11, Number(document.getElementById('filter-rekapan-em-bulan')?.value) || 0));
            const namaBulan=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
            const rows = buatDataRekapanEM(tahun);

            let exportRows;
            if(mode==='month'){
                exportRows = rows.map((row,index) => {
                    const status=statusRekapanEM(row.target,row.selesai);
                    return {
                        "No":index+1,
                        "Bulan":namaBulan[bulanIndex],
                        "Tahun":tahun,
                        "Nama Alkes":row.namaAlat,
                        "Populasi":row.populasi,
                        "Target Tahunan":row.target,
                        "Realisasi Bulan":row.bulan[bulanIndex]||0,
                        "Realisasi Tahunan":row.selesai,
                        "Sisa Target":row.target-row.selesai,
                        "Keterangan":status.text
                    };
                });
            }else{
                exportRows = rows.map((row, index) => {
                    const sisa = row.target - row.selesai;
                    const status = statusRekapanEM(row.target, row.selesai);
                    return {
                        "No": index + 1,
                        "Nama Alkes": row.namaAlat,
                        "Populasi": row.populasi,
                        "Target": row.target,
                        "Selesai": row.selesai,
                        "Sisa": sisa,
                        "Januari": row.bulan[0],
                        "Februari": row.bulan[1],
                        "Maret": row.bulan[2],
                        "April": row.bulan[3],
                        "Mei": row.bulan[4],
                        "Juni": row.bulan[5],
                        "Juli": row.bulan[6],
                        "Agustus": row.bulan[7],
                        "September": row.bulan[8],
                        "Oktober": row.bulan[9],
                        "November": row.bulan[10],
                        "Desember": row.bulan[11],
                        "Keterangan": status.text
                    };
                });
            }

            const worksheet = XLSX.utils.json_to_sheet(exportRows.length ? exportRows : [{"Informasi":"Belum ada data Rekapan EM."}]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekapan EM');

            const safeMonth=namaBulan[bulanIndex];
            XLSX.writeFile(workbook, mode==='month'
                ? `Rekapan_EM_${tahun}_${safeMonth}.xlsx`
                : `Rekapan_EM_${tahun}.xlsx`);
            showToast(`Rekapan EM ${mode==='month'?safeMonth+' ':''}${tahun} berhasil diekspor.`, 'success');
        }


function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            if(!container) return;
            const toast = document.createElement('div');
            
            let bgClass = "bg-emerald-600 text-white shadow-emerald-900/20";
            let iconClass = "fa-solid fa-circle-check";
            if(type === 'error') {
                bgClass = "bg-rose-600 text-white shadow-rose-900/20";
                iconClass = "fa-solid fa-triangle-exclamation";
            } else if(type === 'info') {
                bgClass = "bg-blue-600 text-white shadow-blue-900/20";
                iconClass = "fa-solid fa-circle-info";
            }

            toast.className = `pointer-events-auto flex items-center space-x-3 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold transition-all duration-300 transform translate-y-2 opacity-0 ${bgClass}`;
            toast.innerHTML = `<i class="${iconClass} text-sm"></i><span>${message}</span>`;
            
            container.appendChild(toast);
            setTimeout(() => { toast.classList.remove('translate-y-2', 'opacity-0'); }, 50);
            
            setTimeout(() => {
                toast.classList.add('translate-y-2', 'opacity-0');
                setTimeout(() => { toast.remove(); }, 300);
            }, 3000);
        }


// ============================================================
// MEDIX CONFIRM DIALOG - SATU GAYA UNTUK SEMUA KONFIRMASI
// ============================================================
let medixConfirmResolver = null;
let medixConfirmKeyHandler = null;

function showConfirmDialog(message, options = {}) {
    return new Promise(resolve => {
        const modal = document.getElementById('medix-confirm-dialog');
        const messageEl = document.getElementById('medix-confirm-message');
        const titleEl = document.getElementById('medix-confirm-title');
        const okBtn = document.getElementById('medix-confirm-ok');
        const cancelBtn = document.getElementById('medix-confirm-cancel');
        const iconEl = document.getElementById('medix-confirm-icon');
        if (!modal || !messageEl || !titleEl || !okBtn || !cancelBtn) {
            showToast('Komponen konfirmasi MEDIX tidak tersedia.', 'error');
            resolve(false); return;
        }
        if (typeof medixConfirmResolver === 'function') medixConfirmResolver(false);
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            if (medixConfirmKeyHandler) { document.removeEventListener('keydown', medixConfirmKeyHandler); medixConfirmKeyHandler = null; }
            if (medixConfirmResolver === finish) medixConfirmResolver = null;
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            resolve(Boolean(value));
        };
        medixConfirmResolver = finish;
        titleEl.textContent = options.title || 'Konfirmasi Tindakan';
        messageEl.textContent = String(message || 'Apakah Anda yakin ingin melanjutkan tindakan ini?');
        okBtn.textContent = options.okText || 'Ya, Lanjutkan';
        cancelBtn.textContent = options.cancelText || 'Batal';
        okBtn.classList.toggle('is-safe', options.variant === 'safe');
        iconEl.innerHTML = `<i class="fa-solid ${options.icon || 'fa-triangle-exclamation'}"></i>`;
        iconEl.style.background = options.variant === 'safe' ? '#ecfdf5' : '#fef2f2';
        iconEl.style.color = options.variant === 'safe' ? '#059669' : '#e11d48';
        iconEl.style.borderColor = options.variant === 'safe' ? '#a7f3d0' : '#fecdd3';
        okBtn.onclick = () => finish(true);
        cancelBtn.onclick = () => finish(false);
        modal.onclick = e => { if (e.target === modal) finish(false); };
        medixConfirmKeyHandler = e => { if (e.key === 'Escape') finish(false); else if (e.key === 'Enter') finish(true); };
        document.addEventListener('keydown', medixConfirmKeyHandler);
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        setTimeout(() => okBtn.focus(), 30);
    });
}



function medixRenderSidebarProfile(photoURL = '') {
    const url = String(photoURL || '').trim();
    const imgs = [document.getElementById('sidebar-profile-avatar'), document.getElementById('sidebar-footer-avatar')];
    const icons = [document.getElementById('sidebar-profile-avatar-icon'), document.getElementById('sidebar-footer-avatar-icon')];
    imgs.forEach(img => {
        if (!img) return;
        if (url) { img.src = url; img.classList.remove('hidden'); }
        else { img.removeAttribute('src'); img.classList.add('hidden'); }
    });
    icons.forEach(icon => { if (icon) icon.classList.toggle('hidden', !!url); });
}
function triggerSidebarProfileUpload() {
    if (!auth?.currentUser) return showToast('Silakan login terlebih dahulu.', 'error');
    document.getElementById('sidebar-profile-upload')?.click();
}

// Kompres foto profil di sisi browser sebelum dikirim ke Firebase Storage.
// Hasil selalu JPEG agar ukuran lebih kecil dan konsisten dengan Storage Rules.
async function medixCompressProfileImage(file) {
    const MAX_BYTES = 4 * 1024 * 1024; // target aman di bawah batas Storage 5 MB
    const MAX_DIMENSION = 1280;

    let source = null;
    try {
        if (typeof createImageBitmap === 'function') {
            source = await createImageBitmap(file);
        } else {
            source = await new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto tidak dapat diproses oleh browser.')); };
                img.src = url;
            });
        }

        const originalW = source.width || source.naturalWidth || 1;
        const originalH = source.height || source.naturalHeight || 1;
        const scale = Math.min(1, MAX_DIMENSION / Math.max(originalW, originalH));
        let width = Math.max(1, Math.round(originalW * scale));
        let height = Math.max(1, Math.round(originalH * scale));

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Browser tidak dapat menyiapkan kompresi foto.');

        let blob = null;
        for (let attempt = 0; attempt < 8; attempt++) {
            canvas.width = width;
            canvas.height = height;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(source, 0, 0, width, height);

            const quality = [0.82, 0.76, 0.70, 0.64, 0.58, 0.52, 0.46, 0.40][attempt];
            blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
            if (blob && blob.size <= MAX_BYTES) break;

            // Jika masih besar, turunkan resolusi secara bertahap.
            width = Math.max(480, Math.round(width * 0.82));
            height = Math.max(480, Math.round(height * 0.82));
        }

        if (!blob) throw new Error('Kompresi foto gagal.');
        if (blob.size > MAX_BYTES) {
            throw new Error('Foto tidak dapat dikompres ke ukuran yang aman.');
        }

        return blob;
    } finally {
        if (source && typeof source.close === 'function') source.close();
    }
}

async function handleSidebarProfileUpload(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    if (!auth?.currentUser) {
        showToast('Sesi login tidak ditemukan.', 'error');
        if (input) input.value = '';
        return;
    }

    if (!file.type?.startsWith('image/')) {
        showToast('File harus berupa gambar.', 'error');
        if (input) input.value = '';
        return;
    }

    try {
        showToast('Mengoptimalkan foto profil...', 'info');

        const compressedBlob = await medixCompressProfileImage(file);
        const uid = auth.currentUser.uid;
        const ref = firebase.storage().ref(`profilePhotos/${uid}/avatar.jpg`);

        showToast('Mengunggah foto profil...', 'info');
        const snap = await ref.put(compressedBlob, {
            contentType: 'image/jpeg',
            cacheControl: 'public,max-age=31536000'
        });
        const photoURL = await snap.ref.getDownloadURL();

        // Gunakan nama field yang sesuai dengan Firestore Rules MEDIX saat ini.
        // fotoProfil tetap disimpan sebagai fallback yang sudah digunakan aplikasi.
        await db.collection('users').doc(uid).set({
            fotoURL: photoURL,
            fotoProfil: photoURL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (currentUser) {
            currentUser.photoURL = photoURL;
            currentUser.fotoURL = photoURL;
            currentUser.fotoProfil = photoURL;
        }

        medixRenderSidebarProfile(photoURL);
        showToast('Foto profil berhasil diperbarui.', 'success');
    } catch (error) {
        console.error('Upload foto profil gagal:', error);
        const code = error?.code || '';
        const message = String(error?.message || '');

        if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
            showToast('Upload ditolak Firebase Storage. Pastikan Storage Rules profilePhotos/{uid} sudah dipasang.', 'error');
        } else if (code === 'permission-denied' || message.toLowerCase().includes('permission')) {
            showToast('Foto berhasil diproses tetapi penyimpanan profil ditolak Firestore. Periksa Rules koleksi users.', 'error');
        } else {
            showToast('Foto profil gagal diproses/diunggah. Silakan coba foto lain.', 'error');
        }
    } finally {
        if (input) input.value = '';
    }
}
function medixSyncSidebarFooterAccount() {
    const nameEl=document.getElementById('sidebar-footer-name'), roleEl=document.getElementById('sidebar-footer-role'), topNameEl=document.getElementById('sidebar-account-name');
    if(!nameEl||!roleEl)return;
    const role=(currentUser?.role)||document.getElementById('sidebar-role-badge')?.textContent||'Akun';
    const authName=(currentUser&&(currentUser.nama||currentUser.name||currentUser.username))||'-';
    nameEl.textContent=authName; roleEl.textContent=role||'Akun MEDIX';
    if(topNameEl)topNameEl.textContent=authName;
    medixRenderSidebarProfile(currentUser?.photoURL||currentUser?.fotoProfil||'');
}
async function logoutFirebase() {

            try {
        
                console.log(
                    "Memulai proses logout..."
                );
        
                // ========================================
                // LOGOUT FIREBASE
                // ========================================
        
                await auth.signOut();
        
                // ========================================
                // RESET CONTEXT APLIKASI
                // ========================================
        
                currentUser = null;
                currentUserNama = "";
                currentActiveRole = "";
                userAksesMenuArray = {};
        
                // ========================================
                // RESET LOGIN ROLE
                // ========================================
        
                targetLoginRole = "";
        
                // ========================================
                // TAMPILKAN LOGIN
                // ========================================
        
                const gateScreen =
                    document.getElementById(
                        'auth-gate-screen'
                    );
        
                if (gateScreen) {
                    gateScreen.classList.remove(
                        'hidden'
                    );
                }
        
                console.log(
                    "Firebase logout berhasil."
                );
        
            } catch (error) {
        
                console.error(
                    "Logout error:",
                    error
                );
        
                showToast(
                    "Gagal logout. Silakan coba lagi.",
                    "error"
                );
            }
        }

        auth.onAuthStateChanged(async (firebaseUser) => {

            const gateScreen =
                document.getElementById(
                    'auth-gate-screen'
                );
        
            // ========================================
            // TIDAK LOGIN
            // ========================================
        
            if (!firebaseUser) {
                hentikanListenerFirestore();
                currentUser = null;
                currentUserNama = "";
                currentActiveRole = "";
                userAksesMenuArray = {};
        
                if (gateScreen) {
                    gateScreen.classList.remove('hidden');
                }
        
                console.log(
                    "Tidak ada user Firebase yang login."
                );
        
                return;
            }
        
        
            // ========================================
            // LOGIN / RESTORE SESSION
            // ========================================
        
            console.log(
                "Firebase user aktif:",
                firebaseUser.uid
            );
        
            try {
        
                const userData =
                    await loadFirebaseUserProfile(
                        firebaseUser
                    );
        
                if (!userData) {
        
                    await auth.signOut();
        
                    return;
                }
        
        
                userData.uid =
                    firebaseUser.uid;
        
        
                // ====================================
                // CONTEXT
                // ====================================
        
                applyUserContext(
                    userData
                );
        
        
                console.log(
                    "User context berhasil:",
                    currentUser
                );
        
        
                // ====================================
                // SIDEBAR
                // ====================================
        
                renderSidebarByPermission();
        
        
                // ====================================
                // FIRESTORE LISTENER
                // ====================================
        
                mulaiListenerFirestore();
        
        
                // ====================================
                // TUTUP LOGIN
                // ====================================
        
                if (gateScreen) {
                    gateScreen.classList.add(
                        'hidden'
                    );
                }
        
        
                // ====================================
                // ROLE BADGE
                // ====================================
        
                const roleBadge =
                    document.getElementById(
                        'sidebar-role-badge'
                    );
        
                if (roleBadge) {
                    roleBadge.innerText =
                        currentActiveRole;
                }
        
        
                // ====================================
                // NAMA USER
                // ====================================
        
                const profilCard =
                    document.querySelector(
                        '#app-sidebar p.truncate'
                    );
        
                if (profilCard) {
                    profilCard.innerText =
                        currentUserNama;
                }
        
        
                console.log(
                    "Session MEDIX siap."
                );
        
        
            } catch (error) {
        
                console.error(
                    "Gagal memulihkan session Firebase:",
                    error
                );
        
                await auth.signOut();
        
                if (gateScreen) {
                    gateScreen.classList.remove(
                        'hidden'
                    );
                }
            }
        });

        function bukaFormMaintenance(equipmentId) {

            const permission =
                userAksesMenuArray?.equipment?.maintenance;
        
            if (permission !== true) {
        
                showToast(
                    "Anda tidak memiliki izin untuk menambahkan maintenance.",
                    "error"
                );
        
                return;
            }
        
            const equipment =
                dataEquipment.find(
                    item => item.id === equipmentId
                );
        
            if (!equipment) {
        
                showToast(
                    "Data equipment tidak ditemukan.",
                    "error"
                );
        
                return;
            }
        
            const modal =
                document.getElementById(
                    "modal-maintenance"
                );
        
            if (!modal) {
        
                console.error(
                    "Modal maintenance tidak ditemukan."
                );
        
                return;
            }
        
            document.getElementById(
                "maintenance-equipment-id"
            ).value = equipment.id;
        
            document.getElementById(
                "maintenance-kode-alat"
            ).value =
                equipment.kodeAlat || "";
        
            document.getElementById(
                "maintenance-nama-alat"
            ).value =
                equipment.namaAlat || "";
        
            document.getElementById(
                "maintenance-tanggal"
            ).value =
                new Date()
                    .toISOString()
                    .split("T")[0];
        
            document.getElementById(
                "maintenance-jenis"
            ).value = "";
        
            document.getElementById(
                "maintenance-keluhan"
            ).value = "";
        
            document.getElementById(
                "maintenance-tindakan"
            ).value = "";
        
            document.getElementById(
                "maintenance-hasil"
            ).value = "";
        
            document.getElementById(
                "maintenance-teknisi"
            ).value =
                currentUser?.nama ||
                currentUserNama ||
                "";
        
            document.getElementById(
                "maintenance-biaya"
            ).value = "";
        
            document.getElementById(
                "maintenance-vendor"
            ).value = "";
        
            document.getElementById(
                "maintenance-keterangan"
            ).value = "";
        
            modal.classList.remove("hidden");
        }

        function tutupFormMaintenance() {

            const modal =
                document.getElementById(
                    "modal-maintenance"
                );
        
            if (modal) {
        
                modal.classList.add(
                    "hidden"
                );
        
            }
        }

        async function simpanMaintenance() {

            if (
                userAksesMenuArray?.equipment?.maintenance !== true
            ) {
                showToast(
                    "Anda tidak memiliki izin untuk menyimpan maintenance.",
                    "error"
                );
                return;
            }
        
            const form =
                document.getElementById("form-maintenance");
        
            const editId =
                form?.dataset?.editId || "";
        
            const equipmentId =
                document.getElementById(
                    "maintenance-equipment-id"
                )?.value.trim();
        
            const kodeAlat =
                document.getElementById(
                    "maintenance-kode-alat"
                )?.value.trim();
        
            const namaAlat =
                document.getElementById(
                    "maintenance-nama-alat"
                )?.value.trim();
        
            const tanggal =
                document.getElementById(
                    "maintenance-tanggal"
                )?.value;
        
            const jenis =
                document.getElementById(
                    "maintenance-jenis"
                )?.value;
        
            const keluhan =
                document.getElementById(
                    "maintenance-keluhan"
                )?.value.trim();
        
            const tindakan =
                document.getElementById(
                    "maintenance-tindakan"
                )?.value.trim();
        
            const hasil =
                document.getElementById(
                    "maintenance-hasil"
                )?.value;
        
            const teknisi =
                document.getElementById(
                    "maintenance-teknisi"
                )?.value.trim();
        
            const biayaValue =
                document.getElementById(
                    "maintenance-biaya"
                )?.value;
        
            const vendor =
                document.getElementById(
                    "maintenance-vendor"
                )?.value.trim();
        
            const keterangan =
                document.getElementById(
                    "maintenance-keterangan"
                )?.value.trim();
        
        
            // ============================================
            // VALIDASI
            // ============================================
        
            if (!equipmentId) {
                showToast(
                    "Equipment belum dipilih.",
                    "error"
                );
                return;
            }
        
            if (!tanggal) {
                showToast(
                    "Tanggal maintenance wajib diisi.",
                    "error"
                );
                return;
            }
        
            if (!jenis) {
                showToast(
                    "Jenis maintenance wajib dipilih.",
                    "error"
                );
                return;
            }
        
            if (!tindakan) {
                showToast(
                    "Tindakan maintenance wajib diisi.",
                    "error"
                );
                return;
            }
        
            if (!hasil) {
                showToast(
                    "Hasil maintenance wajib dipilih.",
                    "error"
                );
                return;
            }
        
            if (!teknisi) {
                showToast(
                    "Nama teknisi wajib diisi.",
                    "error"
                );
                return;
            }
        
        
            const biaya =
                biayaValue
                    ? Number(biayaValue)
                    : 0;
        
            if (
                Number.isNaN(biaya) ||
                biaya < 0
            ) {
                showToast(
                    "Biaya maintenance tidak valid.",
                    "error"
                );
                return;
            }
        
        
            // ============================================
            // DATA MAINTENANCE
            // ============================================
        
            const maintenanceData = {
        
                equipmentId:
                    equipmentId,
        
                kodeAlat:
                    kodeAlat || "",
        
                namaAlat:
                    namaAlat || "",
        
                tanggal:
                    tanggal,
        
                jenis:
                    jenis,
        
                keluhan:
                    keluhan || "",
        
                tindakan:
                    tindakan,
        
                hasil:
                    hasil,
        
                teknisi:
                    teknisi,
        
                biaya:
                    biaya,
        
                vendor:
                    vendor || "",
        
                keterangan:
                    keterangan || "",
        
                updatedAt:
                    firebase.firestore.FieldValue
                        .serverTimestamp(),
        
                updatedBy:
                    currentUser?.uid || null
            };
        
        
            try {
        
                // ========================================
                // MODE EDIT
                // ========================================
        
                if (editId) {
        
                    await db
                        .collection("maintenance")
                        .doc(editId)
                        .update(
                            maintenanceData
                        );
        
                    showToast(
                        "Maintenance berhasil diperbarui.",
                        "success"
                    );
        
                }
        
                // ========================================
                // MODE TAMBAH
                // ========================================
        
                else {
        
                    maintenanceData.createdAt =
                        firebase.firestore.FieldValue
                            .serverTimestamp();
        
                    maintenanceData.createdBy =
                        currentUser?.uid || null;
        
                    await db
                        .collection("maintenance")
                        .add(
                            maintenanceData
                        );
        
                    showToast(
                        "Maintenance berhasil disimpan.",
                        "success"
                    );
                }
        
        
                // Sinkronkan histori EM/maintenance ke projection publik.
                if (maintenanceData.equipmentId) medixSyncCurrentAssetPublicHistory(maintenanceData.equipmentId);

                // ========================================
                // RESET MODE EDIT
                // ========================================
        
                if (form) {
                    delete form.dataset.editId;
                }
        
        
                // Tutup modal
                tutupFormMaintenance();
        
        
                console.log(
                    editId
                        ? "Maintenance berhasil diperbarui:"
                        : "Maintenance berhasil ditambahkan:",
                    editId || maintenanceData
                );
        
        
            } catch (error) {
        
                console.error(
                    "Gagal menyimpan maintenance:",
                    error
                );
        
                showToast(
                    editId
                        ? "Gagal memperbarui maintenance: " +
                          error.message
                        : "Gagal menyimpan maintenance: " +
                          error.message,
                    "error"
                );
            }
        }


function renderMaintenanceHistory() {

            const container =
                document.getElementById(
                    "maintenance-history"
                );
        
            if (!container) {
                return;
            }
        
            if (dataMaintenance.length === 0) {
        
                container.innerHTML = `
                    <div class="py-8 text-center text-slate-400">
                        <i class="fa-solid fa-screwdriver-wrench text-2xl mb-2"></i>
                        <p class="text-sm">
                            Belum ada histori maintenance.
                        </p>
                    </div>
                `;
        
                return;
            }
        
            container.innerHTML =
                dataMaintenance.map((item) => {
        
                    const biaya =
                        Number(item.biaya || 0)
                            .toLocaleString(
                                "id-ID"
                            );
        
                    return `
                        <div
                            class="border border-slate-200
                                   rounded-xl p-4
                                   bg-white"
                        >
        
                            <div
                                class="flex flex-col md:flex-row
                                       md:items-start
                                       md:justify-between
                                       gap-3"
                            >
        
                                <div>
        
                                    <div
                                        class="font-semibold
                                               text-slate-800"
                                    >
                                        ${escapeHtmlEquipment(
                                            item.jenis || "-"
                                        )}
                                    </div>
        
                                    <div
                                        class="text-sm
                                               text-slate-500 mt-1"
                                    >
                                        <i class="fa-regular fa-calendar mr-1"></i>
                                        ${escapeHtmlEquipment(
                                            item.tanggal || "-"
                                        )}
                                    </div>
        
                                </div>
        
                                <div
                                    class="text-sm
                                           font-semibold
                                           text-slate-700"
                                >
                                    Rp ${biaya}
                                </div>
        
                            </div>
        
                            <div
                                class="grid grid-cols-1
                                       md:grid-cols-2
                                       gap-3 mt-4"
                            >
        
                                <div>
        
                                    <div
                                        class="text-xs
                                               text-slate-400"
                                    >
                                        Keluhan
                                    </div>
        
                                    <div
                                        class="text-sm
                                               text-slate-700 mt-1"
                                    >
                                        ${escapeHtmlEquipment(
                                            item.keluhan || "-"
                                        )}
                                    </div>
        
                                </div>
        
                                <div>
        
                                    <div
                                        class="text-xs
                                               text-slate-400"
                                    >
                                        Teknisi
                                    </div>
        
                                    <div
                                        class="text-sm
                                               text-slate-700 mt-1"
                                    >
                                        ${escapeHtmlEquipment(
                                            item.teknisi || "-"
                                        )}
                                    </div>
        
                                </div>
        
                                <div
                                    class="md:col-span-2"
                                >
        
                                    <div
                                        class="text-xs
                                               text-slate-400"
                                    >
                                        Tindakan
                                    </div>
        
                                    <div
                                        class="text-sm
                                               text-slate-700 mt-1"
                                    >
                                        ${escapeHtmlEquipment(
                                            item.tindakan || "-"
                                        )}
                                    </div>
        
                                </div>
        
                                <div>
        
                                    <div
                                        class="text-xs
                                               text-slate-400"
                                    >
                                        Hasil
                                    </div>
        
                                    <div
                                        class="text-sm
                                               text-slate-700 mt-1"
                                    >
                                        ${escapeHtmlEquipment(
                                            item.hasil || "-"
                                        )}
                                    </div>
        
                                </div>
        
                                <div>
        
                                    <div
                                        class="text-xs
                                               text-slate-400"
                                    >
                                        Vendor
                                    </div>
        
                                    <div
                                        class="text-sm
                                               text-slate-700 mt-1"
                                    >
                                        ${escapeHtmlEquipment(
                                            item.vendor || "-"
                                        )}
                                    </div>
        
                                </div>
        
                            </div>
        
                        </div>
                    `;
        
                }).join("");
        }

        async function editMaintenance(maintenanceId) {

            if (!maintenanceId) {
                showToast(
                    "ID maintenance tidak ditemukan.",
                    "error"
                );
                return;
            }
        
            if (
                userAksesMenuArray?.equipment?.maintenance !== true
            ) {
                showToast(
                    "Anda tidak memiliki izin mengedit maintenance.",
                    "error"
                );
                return;
            }
        
            try {
        
                const doc =
                    await db
                        .collection("maintenance")
                        .doc(maintenanceId)
                        .get();
        
                if (!doc.exists) {
        
                    showToast(
                        "Data maintenance tidak ditemukan.",
                        "error"
                    );
        
                    return;
                }
        
                const data = doc.data();
        
                console.log(
                    "DATA MAINTENANCE UNTUK EDIT =",
                    data
                );
        
                // Buka form Maintenance
                bukaFormMaintenance(
                    data.equipmentId
                );
        
                // Isi form
                document.getElementById(
                    "maintenance-equipment-id"
                ).value =
                    data.equipmentId || "";
        
                document.getElementById(
                    "maintenance-kode-alat"
                ).value =
                    data.kodeAlat || "";
        
                document.getElementById(
                    "maintenance-nama-alat"
                ).value =
                    data.namaAlat || "";
        
                document.getElementById(
                    "maintenance-tanggal"
                ).value =
                    data.tanggal || "";
        
                document.getElementById(
                    "maintenance-jenis"
                ).value =
                    data.jenis || "";
        
                document.getElementById(
                    "maintenance-keluhan"
                ).value =
                    data.keluhan || "";
        
                document.getElementById(
                    "maintenance-tindakan"
                ).value =
                    data.tindakan || "";
        
                document.getElementById(
                    "maintenance-hasil"
                ).value =
                    data.hasil || "";
        
                document.getElementById(
                    "maintenance-teknisi"
                ).value =
                    data.teknisi || "";
        
                document.getElementById(
                    "maintenance-biaya"
                ).value =
                    data.biaya || 0;
        
                document.getElementById(
                    "maintenance-vendor"
                ).value =
                    data.vendor || "";
        
                document.getElementById(
                    "maintenance-keterangan"
                ).value =
                    data.keterangan || "";
        
                // Simpan ID untuk mode EDIT
                const form =
                    document.getElementById(
                        "form-maintenance"
                    );
        
                if (form) {
                    form.dataset.editId =
                        maintenanceId;
                }
        
                console.log(
                    "Mode EDIT Maintenance:",
                    maintenanceId
                );
        
            } catch (error) {
        
                console.error(
                    "Gagal mengambil maintenance:",
                    error
                );
        
                showToast(
                    "Gagal membuka data maintenance.",
                    "error"
                );
            }
        }
        
        function applyMedixTheme(theme) {
            const body = document.getElementById('main-app-body');
            const themeIcon = document.getElementById('theme-icon');
            const themeMeta = document.getElementById('medix-theme-color');
            const isDark = theme === 'dark';
            if (!body) return;
            body.classList.toggle('dark-mode', isDark);
            localStorage.setItem('medix_theme', isDark ? 'dark' : 'light');
            if (themeMeta) themeMeta.setAttribute('content', isDark ? '#0b1220' : '#0f766e');
            if (themeIcon) { themeIcon.className = isDark ? 'fa-solid fa-moon text-lg text-slate-200' : 'fa-solid fa-sun text-lg text-amber-500'; const themeBtn = themeIcon.closest('button'); if (themeBtn) { themeBtn.title = isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'; themeBtn.setAttribute('aria-label', themeBtn.title); } }
        }

        function toggleLightDarkMode() {
            const body = document.getElementById('main-app-body');
            const next = body && body.classList.contains('dark-mode') ? 'light' : 'dark';
            applyMedixTheme(next);
            setTimeout(() => {
                renderGrafikDashboardDinamis();
                renderGrafikTrenKerusakan();
            }, 120);
        }

        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('medix_theme');
            const themeIcon = document.getElementById('theme-icon');
            applyMedixTheme(savedTheme === 'dark' ? 'dark' : 'light');
        });
        
        let dataBukuPetunjuk = [];
        let html5QrCodeScanner = null;
        let riwayatNavigasiTab = ['dashboard'];
        
        let dataAlat = []; let dataKalibrasi = []; let dataPerbaikan = []; let dataPM = []; let dataInspeksi = []; let dataTiket = []; let dataUserSistem = []; let dataKeluhanLog = [];
        let globalFilterStatus = "all"; subTabDokumenAktif = "all"; let stringFotoBase64 = "-"; let stringFotoBeforeBase64 = "-";
        let instanceChartKondisi = null; let instanceChartRuangan = null; let instanceChartTren = null;

        let terpakaiAlatKerja = []; 
        let terpakaiFisik = []; 
        let terpakaiFungsi = [];

        let opsAlatKerja = []; let opsFisik = []; let opsFungsi = [];
        let listNamaTeknisi = []; let listNamaSaksi = [];
        let globalSelectedAlatIdUntukLog = ""; 
        let globalSelectedAlatIdForLog = "";

        document.addEventListener('click', function(e) {
            try {
                if (!e.target.closest('#input-search-alat-etiket') && !e.target.closest('#dropdown-pilih-alat-etiket')) {
                    const el = document.getElementById('dropdown-pilih-alat-etiket');
                    if(el) el.style.display = 'none';
                }
                if (!e.target.closest('#input-search-alat-kalibrasi') && !e.target.closest('#dropdown-pilih-alat-kalibrasi')) {
                    const el = document.getElementById('dropdown-pilih-alat-kalibrasi');
                    if(el) el.style.display = 'none';
                }
                if (!e.target.closest('#input-search-alat-worksheet') && !e.target.closest('#dropdown-pilih-alat-worksheet')) {
                    const el = document.getElementById('dropdown-pilih-alat-worksheet');
                    if(el) el.style.display = 'none';
                }
            } catch(err) {}
        });

        function toggleLihatPassword(inputId, tombolEl) {
            const field = document.getElementById(inputId);
            const icon = tombolEl.querySelector('i');
            if (field && icon) {
                if (field.type === 'password') { field.type = 'text'; icon.className = 'fa-solid fa-eye-slash text-xs'; }
                else { field.type = 'password'; icon.className = 'fa-solid fa-eye text-xs'; }
            }
        }

        function pilihRoleSebelumLogin(role) {
            targetLoginRole = role;
        
            const boxRole = document.getElementById('box-pilih-role');
            const formLogin = document.getElementById('form-login-kredensial');
            const subtitle = document.getElementById('gate-subtitle');
        
            if (boxRole) boxRole.classList.add('hidden');
            if (formLogin) formLogin.classList.remove('hidden');
        
            if (subtitle) {
                subtitle.innerText =
                    "Silakan masukkan email dan password";
            }
        
            const emailInput =
                document.getElementById('login-email');
        
            const passwordInput =
                document.getElementById('login-password');
        
            if (emailInput) emailInput.value = "";
            if (passwordInput) passwordInput.value = "";
        
            if (emailInput) emailInput.focus();
        }

        function kembaliKePilihRole() {
            targetLoginRole = "";
            const boxRole = document.getElementById('box-pilih-role');
            const formLogin = document.getElementById('form-login-kredensial');
            const subtitle = document.getElementById('gate-subtitle');
            
            if(boxRole) boxRole.classList.remove('hidden');
            if(formLogin) formLogin.classList.add('hidden');
            if(subtitle) subtitle.innerText = "MEDICAL INVENTORY & MAINTENANCE EXCELLENCE";
        }

        async function validasiKredensialUser(e) {

            e.preventDefault();
        
            const emailEl =
                document.getElementById('login-email');
        
            const passwordEl =
                document.getElementById('login-password');
        
            if (!emailEl || !passwordEl) {
                return;
            }
        
            const email =
                emailEl.value.trim();
        
            const password =
                passwordEl.value;
        
            const submitBtn =
                e.target.querySelector('button[type="submit"]');
        
            if (submitBtn) {
                submitBtn.innerText = "Memverifikasi...";
                submitBtn.disabled = true;
            }
        
            try {
        
                // ============================================
                // FIREBASE AUTHENTICATION
                // ============================================
        
                await loginWithFirebaseAuth(
                    email,
                    password
                );
        
                // ============================================
                // USER CONTEXT SUDAH DIISI OLEH
                // applyUserContext()
                // ============================================
        
                console.log(
                    "Login MEDIX berhasil:",
                    currentUser
                );
        
                // ============================================
                // TUTUP LOGIN GATE
                // ============================================
        
                const gateScreen =
                    document.getElementById('auth-gate-screen');
        
                if (gateScreen) {
                    gateScreen.classList.add('hidden');
                }
        
                // ============================================
                // ROLE BADGE
                // MENGGUNAKAN ROLE ASLI DARI FIRESTORE
                // ============================================
        
                const roleBadge =
                    document.getElementById('sidebar-role-badge');
        
                if (roleBadge) {
                    roleBadge.innerText =
                        currentActiveRole;
                }
        
                // ============================================
                // NAMA USER
                // ============================================
        
                const profilCard =
                    document.querySelector(
                        '#app-sidebar p.truncate'
                    );
        
                if (profilCard) {
                    profilCard.innerText =
                        currentUserNama;
                }
        
                // ============================================
                // AKSES MENU & AKSI BERDASARKAN PERIZINAN AKUN
                // ============================================
                renderSidebarByPermission();
                ensureUserEticketForm();

                const role = currentActiveRole || 'User';
                const masterRead = izinMenu('master', 'read');
                const masterTambah = izinMenu('master', 'tambah');
                const masterEdit = izinMenu('master', 'edit');
                const masterHapus = izinMenu('master', 'hapus');
                const masterImport = izinMenu('master', 'import');
                const masterExport = izinMenu('master', 'export');
                const ticketLapor = canonicalRole(currentActiveRole) === 'User' ? true : izinMenu('ticket', 'lapor');
                const riwayatUpload = ['Admin','Teknisi'].includes(canonicalRole(currentActiveRole)) || izinMenu('riwayat', 'upload');

                // Container tombol Master Data harus diambil di dalam scope login handler.
                // Sebelumnya variabel ini dipakai tanpa deklarasi sehingga setiap login
                // memunculkan ReferenceError: containerMasterAction is not defined.
                const containerMasterAction = document.getElementById(
                    'master-action-buttons-container'
                );

                if (containerMasterAction) {
                    // Semua tombol header dirender oleh satu fungsi agar tombol label
                    // tidak pernah hilang saat render ulang.
                    syncMasterHeaderActions();
                }

                const btnUploadPdf = document.getElementById('btn-upload-pdf-baru');
                if (btnUploadPdf) btnUploadPdf.classList.toggle('hidden', !riwayatUpload);

                const boxTicket = document.getElementById('box-form-buat-ticket');
                if (boxTicket) boxTicket.classList.toggle('hidden', !ticketLapor);

                // Tombol cepat pembuatan LK hanya untuk akun yang memiliki izin mengerjakan tiket.
                document.querySelectorAll('.menu-akses-teknisi').forEach(el => {
                    el.classList.toggle('hidden', !izinMenu('ticket', 'kerjakan'));
                });

                // ============================================
                // RENDER APLIKASI
                // ============================================
        
                renderAll();
                initMasterTableNavigation();
                // Pastikan form E-Ticket User tidak tertinggal tersembunyi setelah render ulang.
                requestAnimationFrame(() => ensureUserEticketForm());
        
                setTimeout(() => {
        
                    renderGrafikDashboardDinamis();
        
                    renderGrafikTrenKerusakan();
        
                }, 300);
        
                // ============================================
                // RESET BUTTON
                // ============================================
        
                if (submitBtn) {
                    submitBtn.innerText = "Masuk";
                    submitBtn.disabled = false;
                }
        
            } catch (error) {
        
                console.error(
                    "Login MEDIX gagal:",
                    error
                );
        
                let pesan =
                    "Email atau password salah.";
        
                if (
                    error &&
                    error.code ===
                    'auth/user-not-found'
                ) {
        
                    pesan =
                        "Akun tidak ditemukan.";
        
                } else if (
                    error &&
                    error.code ===
                    'auth/wrong-password'
                ) {
        
                    pesan =
                        "Password salah.";
        
                } else if (
                    error &&
                    error.code ===
                    'auth/invalid-email'
                ) {
        
                    pesan =
                        "Format email tidak valid.";
        
                } else if (
                    error &&
                    error.message
                ) {
        
                    pesan =
                        error.message;
                }
        
                showToast(
                    pesan,
                    'error'
                );
        
                if (submitBtn) {
                    submitBtn.innerText = "Masuk";
                    submitBtn.disabled = false;
                }
            }
        }
        
        function aktualisasikanDotKoneksiHijau() {
            const dot = document.getElementById('status-dot');
            if(dot) dot.className = "w-3.5 h-3.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]";
        }

        function renderGrafikDashboardDinamis() {
            try {
                if(dataAlat.length === 0) return;
                const jReady = dataAlat.filter(a => a.status === 'Siap Digunakan').length;
                const jBroken = dataAlat.filter(a => a.status === 'Dalam Perbaikan').length;

                const isDark = document.getElementById('main-app-body').classList.contains('dark-mode');
                const textColor = isDark ? '#e2e8f0' : '#334155';

                const ctxKondisi = document.getElementById('chartKondisiAlat');
                if (ctxKondisi) {
                    if (instanceChartKondisi) instanceChartKondisi.destroy();
                    instanceChartKondisi = new Chart(ctxKondisi, {
                        type: 'doughnut',
                        data: {
                            labels: ['Siap Digunakan', 'Dalam Perbaikan'],
                            datasets: [{ data: [jReady, jBroken], backgroundColor: ['rgba(13, 148, 136, 0.85)', 'rgba(124, 58, 237, 0.85)'], borderColor: isDark ? '#111827' : '#ffffff', borderWidth: 1.5 }]
                        },
                        options: { plugins: { legend: { display: true, position: 'bottom', labels: { color: textColor, font: { size: 10, weight: 'bold' } } } }, cutout: '70%', responsive: true, maintainAspectRatio: false }
                    });
                }

                const hitungRuangan = {};
                dataAlat.forEach(a => {
                    let namaRuang = a.ruangan || a.edar || a.lokasi || 'Umum';
                    hitungRuangan[namaRuang] = (hitungRuangan[namaRuang] || 0) + 1;
                });

                const ruanganTerurut = Object.entries(hitungRuangan).sort((x, y) => y[1] - x[1]);
                const labelRuangan = ruanganTerurut.map(item => item[0]);
                const skorRuangan = ruanganTerurut.map(item => item[1]);

                const ctxRuangan = document.getElementById('chartSebaranRuangan');
                if (ctxRuangan && labelRuangan.length > 0) {
                    if (instanceChartRuangan) instanceChartRuangan.destroy();
                    const ctx = ctxRuangan.getContext('2d');
                    const gradient = ctx.createLinearGradient(0, 0, 500, 0);
                    gradient.addColorStop(0, 'rgba(37, 99, 235, 0.85)');
                    gradient.addColorStop(1, 'rgba(124, 58, 237, 0.85)');

                    instanceChartRuangan = new Chart(ctxRuangan, {
                        type: 'bar',
                        data: {
                            labels: labelRuangan,
                            datasets: [{ label: 'Jumlah Aset', data: skorRuangan, backgroundColor: gradient, borderColor: '#7c3aed', borderWidth: 1, borderRadius: 4, barPercentage: 0.7 }]
                        },
                        options: {
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)' }, ticks: { color: textColor, font: { size: 10, weight: 'bold' } } },
                                y: { grid: { display: false }, ticks: { color: textColor, font: { size: 10, weight: 'bold' } } }
                            },
                            plugins: { legend: { display: false } }
                        }
                    });
                }
            } catch (error) {}
        }

        // FITUR TAMBAHAN: Fungsi Render Grafik Tren Kerusakan
        function renderGrafikTrenKerusakan() {
            const ctxEl = document.getElementById('chartTrenKerusakan');
            if (!ctxEl) return;

            const bulanCounts = { "Jan": 0, "Feb": 0, "Mar": 0, "Apr": 0, "Mei": 0, "Jun": 0, "Jul": 0, "Agt": 0, "Sep": 0, "Okt": 0, "Nov": 0, "Des": 0 };
            const namaBulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

            if (dataPerbaikan && Array.isArray(dataPerbaikan)) {
                dataPerbaikan.forEach(item => {
                    if (item.textTgl) {
                        let d = new Date(item.textTgl);
                        if (!isNaN(d.getMonth())) {
                            let bStr = namaBulan[d.getMonth()];
                            bulanCounts[bStr] = (bulanCounts[bStr] || 0) + 1;
                        }
                    }
                });
            }

            const isDark = document.getElementById('main-app-body').classList.contains('dark-mode');
            const textColor = isDark ? '#e2e8f0' : '#334155';

            if (instanceChartTren) instanceChartTren.destroy();
            instanceChartTren = new Chart(ctxEl, {
                type: 'line',
                data: {
                    labels: namaBulan,
                    datasets: [{
                        label: 'Jumlah Kerusakan / Perbaikan',
                        data: Object.values(bulanCounts),
                        borderColor: '#f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: textColor } },
                        y: { grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: textColor, precision: 0 } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // FITUR TAMBAHAN: Ekspor Laporan Bulanan PDF Profesional
        function exportLaporanBulananPDF() {
            let htmlContent = `
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <title>Laporan Rekapitulasi Pemeliharaan Alkes - UPTD RSUD Pondokgede</title>
                    

                </head>
                <body>
                    <div class="no-print" style="margin-bottom: 20px; text-align: right;">
                        <button onclick="if(window.opener&&window.opener.medixOpenPrintSettings){window.opener.medixOpenPrintSettings(window,{title:'Laporan Rekapitulasi Pemeliharaan',mode:'child-print',defaultPreset:'A4',defaultOrientation:'landscape',defaultMargin:8})}else{window.print()}" style="background: #2563eb; color: #fff; border: none; padding: 8px 16px; font-weight: bold; border-radius: 6px; cursor: pointer;">🖨️ Cetak / Simpan PDF</button>
                    </div>
                    <div class="kop">
                        <h2>PEMERINTAH KOTA BEKASI</h2>
                        <h2>DINAS KESEHATAN</h2>
                        <h3>UPTD RSUD KELAS D PONDOKGEDE</h3>
                        <p>Jl. Raya Jatiwaringin No. 1 RT. 01 / RW. 01 Kel. Jatiwaringin</p>
                        <p>Kec. Pondokgede - Kota Bekasi</p>
                    </div>
                    <h3 style="text-align: center; font-size: 13px; text-decoration: underline; margin-bottom: 15px;">LAPORAN REKAPITULASI PEMELIHARAAN & PERBAIKAN ALAT KESEHATAN</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>No. Lembar Kerja</th>
                                <th>Jenis Pekerjaan</th>
                                <th>Waktu</th>
                                <th>Uraian / Keterangan</th>
                                <th>Hasil Akhir</th>
                                <th>Teknisi</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            let gabungLog = [...(dataPerbaikan || []), ...(dataPM || []), ...(dataInspeksi || [])];
            if (gabungLog.length === 0) {
                htmlContent += `<tr><td colspan="7" style="text-align: center; font-style: italic;">Tidak ada data riwayat pemeliharaan.</td></tr>`;
            } else {
                gabungLog.forEach((item, idx) => {
                    htmlContent += `
                        <tr>
                            <td>${idx + 1}</td>
                            <td><b>${item.noLk || '-'}</b></td>
                            <td>${item.jenisKerja || '-'}</td>
                            <td>${(item.textTgl || '-').replace('T', ' ')}</td>
                            <td>${item.desc_kerja || item.desc || '-'}</td>
                            <td><b>${item.hasilTunggal || '-'}</b></td>
                            <td>${item.teknisiTtd || '-'}</td>
                        </tr>
                    `;
                });
            }

            htmlContent += `
                        </tbody>
                    </table>
                    <div class="tanda-tangan">
                        <p>Bekasi, ${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                        <p><b>Penanggung Jawab IPSRS Alkes</b></p>
                        <br><br><br>
                        <p><b>( ............................................ )</b></p>
                    </div>
                

</body>
                </html>
            `;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const blobUrl = URL.createObjectURL(blob);
            const win = window.open(blobUrl, '_blank');
            if (!win) showToast("Pop-up diblokir browser.", "error");
        }

        // Laporan tahunan riwayat pemeliharaan. Mengikuti struktur laporan bulanan,
        // tetapi hanya mengambil LK/riwayat yang tanggalnya berada pada tahun terpilih.
        function exportLaporanTahunanPDF(tahunArg) {
            const tahun = Number(tahunArg) || new Date().getFullYear();
            let htmlContent = `
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <title>Laporan Tahunan Rekapitulasi Pemeliharaan Alkes ${tahun}</title>
                    

                </head>
                <body>
                    <div class="no-print">
                        <button class="btn-print" onclick="if(window.opener&&window.opener.medixOpenPrintSettings){window.opener.medixOpenPrintSettings(window,{title:'Laporan Tahunan Rekapitulasi Pemeliharaan',mode:'child-print',defaultPreset:'A4',defaultOrientation:'landscape',defaultMargin:8})}else{window.print()}">🖨️ Cetak / Simpan PDF</button>
                    </div>
                    <div class="kop">
                        <h2>PEMERINTAH KOTA BEKASI</h2> 
                        <h2>DINAS KESEHATAN</h2>
                        <h3>UPTD RSUD KELAS D PONDOKGEDE</h3>
                        <p>Jl. Raya Jatiwaringin No. 1 RT. 01 / RW. 01 Kel. Jatiwaringin</p>
                        <p>Kec. Pondokgede - Kota Bekasi</p>
                    </div>
                    <div class="periode">LAPORAN TAHUNAN REKAPITULASI PEMELIHARAAN &amp; PERBAIKAN ALAT KESEHATAN — ${tahun}</div>
                    <table>
                        <thead><tr><th>No</th><th>No. Lembar Kerja</th><th>Jenis Pekerjaan</th><th>Waktu</th><th>Uraian / Keterangan</th><th>Hasil Akhir</th><th>Teknisi</th></tr></thead>
                        <tbody>
            `;
            const gabungLog = [...(dataPerbaikan || []), ...(dataPM || []), ...(dataInspeksi || [])]
                .filter(item => {
                    const raw = String(item.textTgl || item.tgl || '');
                    const match = raw.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
                    return match ? Number(match[1]) === tahun : false;
                })
                .sort((a,b) => String(b.textTgl || b.tgl || '').localeCompare(String(a.textTgl || a.tgl || '')));
            if (!gabungLog.length) {
                htmlContent += `<tr><td colspan="7" style="text-align:center;font-style:italic">Tidak ada data riwayat pemeliharaan untuk tahun ${tahun}.</td></tr>`;
            } else {
                gabungLog.forEach((item, idx) => {
                    const esc = v => String(v ?? '-').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
                    htmlContent += `<tr><td>${idx+1}</td><td><b>${esc(item.noLk || '-')}</b></td><td>${esc(item.jenisKerja || '-')}</td><td>${esc(String(item.textTgl || item.tgl || '-').replace('T',' '))}</td><td>${esc(item.desc_kerja || item.desc || '-')}</td><td><b>${esc(item.hasilTunggal || '-')}</b></td><td>${esc(item.teknisiTtd || '-')}</td></tr>`;
                });
            }
            htmlContent += `</tbody></table><div class="tanda-tangan"><p>Bekasi, ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p><p><b>Penanggung Jawab IPSRS Alkes</b></p><br><br><br><p><b>( ............................................ )</b></p></div></body></html>`;
            const blob = new Blob([htmlContent], {type:'text/html'});
            const blobUrl = URL.createObjectURL(blob);
            const win = window.open(blobUrl, '_blank');
            if (!win) { URL.revokeObjectURL(blobUrl); showToast('Pop-up diblokir browser.','error'); }
        }

        function evaluasiJatuhTempoKalibrasiMassal() {
            const warningBox = document.getElementById('box-peringatan-kalibrasi');
            const warningList = document.getElementById('list-warning-kalibrasi');
            if(!warningBox || !warningList) return;
            let htmlWarning = ""; const hariIni = new Date();
            dataAlat.forEach(a => {
                const listCal = dataKalibrasi.filter(c => c.alatId === a.id);
                if(listCal.length > 0) {
                    listCal.sort((x, y) => String(y.exp).localeCompare(String(x.exp)));
                    const calTerbaru = listCal[0]; const tglExp = new Date(calTerbaru.exp);
                    const selisihHari = Math.ceil((tglExp.getTime() - hariIni.getTime()) / (1000 * 3600 * 24));
                    if(selisihHari <= 0) htmlWarning += `<li>Aset <b>${a.nama}</b> (SN: ${a.seri || '-'}) <span class="text-rose-600 font-bold">KEDALUWARSA</span> sejak ${calTerbaru.exp}.</li>`;
                    else if(selisihHari <= 30) htmlWarning += `<li>Aset <b>${a.nama}</b> (SN: ${a.seri || '-'}) akan habis dalam <span class="text-amber-600 font-bold">${selisihHari} hari</span> (${calTerbaru.exp}).</li>`;
                }
            });
            if(htmlWarning !== "") { warningList.innerHTML = htmlWarning; warningBox.classList.remove('hidden'); } else { warningBox.classList.add('hidden'); }
        }

        function populasikanDropdownEtiketAlat(keyword = "") {
            const containerEl = document.getElementById('dropdown-pilih-alat-etiket');
            if(!containerEl) return;
            const kw = keyword.toLowerCase();
            const filtered = dataAlat.filter(a => `${a.nama || ''} ${a.seri || ''} ${a.ruangan || a.lokasi || ''}`.toLowerCase().includes(kw));
            if(filtered.length === 0) { containerEl.innerHTML = `<div class="p-2.5 text-slate-400 italic text-center">Alat tidak ditemukan</div>`; return; }
            containerEl.innerHTML = filtered.map(a => `
                <div onclick="pilihAlatKeEtiketDariDiv('${a.id}')" class="p-2.5 hover:bg-amber-50 cursor-pointer border-b border-slate-100 truncate">
                    📌 <b>${a.nama}</b> | SN: <span class="font-mono text-cyan-600">${a.seri || '-'}</span> <span class="text-slate-500">(${a.ruangan || a.lokasi || 'Unit'})</span>
                </div>
            `).join('');
        }

        function showDropdownEtiketAlat() {
            const containerEl = document.getElementById('dropdown-pilih-alat-etiket');
            if(containerEl) { populasikanDropdownEtiketAlat(document.getElementById('input-search-alat-ticket').value); containerEl.style.display = "block"; }
        }

        function handleSearchEtiketAlat(kw) {
            populasikanDropdownEtiketAlat(kw);
            const containerEl = document.getElementById('dropdown-pilih-alat-etiket');
            if(containerEl) containerEl.style.display = "block";
        }

        function pilihAlatKeEtiketDariDiv(alatId) {
            const selectedObj = dataAlat.find(a => a.id == alatId);
            if(selectedObj) {
                document.getElementById('ticket-form-alat').value = selectedObj.id;
                document.getElementById('input-search-alat-ticket').value = `${selectedObj.nama} (SN: ${selectedObj.seri || '-'}) - [${selectedObj.ruangan || selectedObj.lokasi || 'Unit'}]`;
            }
            const containerEl = document.getElementById('dropdown-pilih-alat-etiket');
            if(containerEl) containerEl.style.display = "none";
        }

        function populasikanDropdownAlatDiKalibrasi(keyword = "") {
            const selectEl = document.getElementById('form-cal-alat-id'); if(!selectEl) return;
            const kw = keyword.toLowerCase();
            const filtered = dataAlat.filter(a => (a.nama + " " + (a.ruangan || a.lokasi || '')).toLowerCase().includes(kw));
            selectEl.innerHTML = filtered.map(a => `<option value="${a.id}">${a.nama} - [${a.ruangan || a.lokasi || 'Unit'}]</option>`).join('');
        }

        function populasikanDropdownAlatDiWorksheet(keyword = "") {
            const containerEl = document.getElementById('dropdown-pilih-alat-worksheet');
            if(!containerEl) return;
            const kw = keyword.toLowerCase();
            const filtered = dataAlat.filter(a => `${a.nama || ''} ${a.seri || ''} ${a.ruangan || a.lokasi || ''}`.toLowerCase().includes(kw));
            if(filtered.length === 0) { containerEl.innerHTML = `<div class="p-2 text-slate-400 italic text-center">Alat tidak ditemukan</div>`; return; }
            containerEl.innerHTML = filtered.map(a => `
                <div onclick="pilihAlatKeWorksheetDariDiv('${a.id}')" class="p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 truncate">
                    📌 <b>${a.nama}</b> | SN: <span class="font-mono text-blue-600">${a.seri || '-'}</span> <span class="text-slate-500">(${a.ruangan || a.lokasi || 'Unit'})</span>
                </div>
            `).join('');
        }

        function showDropdownWorksheetAlat() {
            const containerEl = document.getElementById('dropdown-pilih-alat-worksheet');
            if(containerEl) { populasikanDropdownAlatDiWorksheet(document.getElementById('input-search-alat-worksheet').value); containerEl.style.display = "block"; }
        }

        function handleSearchWorksheetAlat(kw) {
            populasikanDropdownAlatDiWorksheet(kw);
            const containerEl = document.getElementById('dropdown-pilih-alat-worksheet');
            if(containerEl) containerEl.style.display = "block";
        }

        function pilihAlatKeWorksheetDariDiv(alatId) {
            sinkronisasiDataAlatKeWorksheet(alatId);
            const containerEl = document.getElementById('dropdown-pilih-alat-worksheet');
            if(containerEl) containerEl.style.display = "none";
            const selectedObj = dataAlat.find(a => a.id == alatId);
            if(selectedObj) { document.getElementById('input-search-alat-worksheet').value = selectedObj.nama + " (" + (selectedObj.seri || "-") + ")"; }
        }

        function previewFotoTiketDipilih(input) {
            const file = input.files[0];
            if(file) {
                const reader = new FileReader(); reader.readAsDataURL(file);
                reader.onload = function(e) {
                    const img = new Image(); img.src = e.target.result;
                    img.onload = function() {
                        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                        let max_size = 500; let w = img.width; let h = img.height;
                        if (w > h) { if (w > max_size) { h *= max_size / w; w = max_size; } } else { if (h > max_size) { w *= max_size / h; h = max_size; } }
                        canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
                        stringFotoBeforeBase64 = canvas.toDataURL('image/jpeg', 0.8);
                        const box = document.getElementById('ticket-preview-foto-box');
                        box.classList.remove('hidden');
                        box.innerHTML = `<img src="${stringFotoBeforeBase64}" class="w-full h-full object-cover">`;
                        document.getElementById('ticket-input-container').style.display = 'none';
                        if(!document.getElementById('btn-retake-ticket')) {
                            let btn = document.createElement('button');
                            btn.type = 'button'; btn.id = 'btn-retake-ticket';
                            btn.className = 'mt-1 text-[9px] text-rose-600 hover:underline font-bold block';
                            btn.innerText = 'Foto Ulang'; btn.onclick = resetFotoTicketBefore;
                            box.parentNode.appendChild(btn);
                        }
                    };
                };
            }
        }

        function resetFotoTicketBefore() {
            stringFotoBeforeBase64 = "-";
            document.getElementById('ticket-form-foto').value = "";
            document.getElementById('ticket-preview-foto-box').classList.add('hidden');
            document.getElementById('ticket-input-container').style.display = 'block';
            const btn = document.getElementById('btn-retake-ticket');
            if(btn) btn.remove();
        }

        async function kirimTiketKeluhanKerusakan(e) {
            e.preventDefault();
            if (!izinMenu('ticket', 'lapor')) { showToast('Akun ini tidak memiliki izin untuk melaporkan kerusakan.', 'error'); return; }
            if (window.__sedangKirimTiket) return;

            const alatIdEl = document.getElementById('ticket-form-alat');
            const keluhanEl = document.getElementById('ticket-form-keluhan');
            const searchAlatEl = document.getElementById('input-search-alat-ticket');
            const submitBtn = e && e.submitter ? e.submitter : e.currentTarget?.querySelector('button[type="submit"]');
            const alatId = alatIdEl ? alatIdEl.value.trim() : '';
            const keluhan = keluhanEl ? keluhanEl.value.trim() : '';

            if (!auth.currentUser) {
                showToast("Sesi login sudah berakhir. Silakan login kembali.", "error");
                return;
            }
            if (!alatId) {
                showToast("Pilih alat terlebih dahulu dari dropdown pencarian!", "error");
                if (searchAlatEl) searchAlatEl.focus();
                return;
            }
            if (!keluhan) {
                showToast("Uraian masalah/keluhan wajib diisi!", "error");
                if (keluhanEl) keluhanEl.focus();
                return;
            }

            const selectedAlatObj = dataAlat.find(a => String(a.id) === String(alatId));
            if (!selectedAlatObj) {
                showToast("Data alat tidak ditemukan. Silakan pilih ulang alat dari daftar!", "error");
                if (alatIdEl) alatIdEl.value = '';
                if (searchAlatEl) searchAlatEl.focus();
                return;
            }

            window.__sedangKirimTiket = true;
            const tombolAsli = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Mengirim...</span>';
            }

            const now = new Date();
            const tglLaporStr = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0');
            const fotoBefore = stringFotoBeforeBase64 || '-';
            const pelaporUid = auth.currentUser.uid;
            const payloadTicket = {
                alatId: selectedAlatObj.id,
                keluhan,
                fotoBefore,
                statusTiket: "Menunggu Tindakan",
                tglLapor: tglLaporStr,
                pelaporUid,
                pelaporNama: currentUserNama || auth.currentUser.email || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                // Hanya operasi ticket yang ditunggu. Begitu ini berhasil,
                // tombol selesai loading dan ticket langsung terlihat oleh listener teknisi.
                const ticketRef = await db.collection("troubleTickets").add(payloadTicket);

                // Sinkronisasi tambahan tidak boleh menahan tombol.
                const secondaryTasks = [];

                secondaryTasks.push(
                    db.collection("laporanKeluhanLog").add({
                        alatId: selectedAlatObj.id,
                        noLk: "TICKET-LOG",
                        jenisKerja: "Laporan Kerusakan",
                        textTgl: tglLaporStr,
                        desc_kerja: "Keluhan: " + keluhan,
                        fotoBefore,
                        hasilTunggal: "Menunggu Penanganan",
                        teknisiTtd: "-",
                        ticketId: ticketRef.id,
                        pelaporUid,
                        pelaporNama: currentUserNama || auth.currentUser.email || '',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).catch(err => console.warn("Log tiket gagal:", err))
                );

                // User hanya boleh melakukan transisi status ke Dalam Perbaikan
                // sesuai Rules. Ini membuat dashboard desktop/mobile ikut berubah.
                secondaryTasks.push(
                    db.collection("dataAlat").doc(selectedAlatObj.id).update({
                        status: "Dalam Perbaikan",
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).catch(err => console.warn("Status aset gagal disinkronkan:", err))
                );

                // Telegram dijalankan tanpa menunggu response API.
                secondaryTasks.push(
                    kirimNotifikasiTelegramOtomatis(
                        selectedAlatObj.nama,
                        selectedAlatObj.ruangan || selectedAlatObj.lokasi || 'Unit',
                        keluhan,
                        ticketRef.id
                    )
                );

                Promise.allSettled(secondaryTasks).then(() => {
                    // Listener Firestore tetap menjadi sumber tampilan utama.
                });

                if (keluhanEl) keluhanEl.value = "";
                if (alatIdEl) alatIdEl.value = "";
                if (searchAlatEl) searchAlatEl.value = "";
                resetFotoTicketBefore();
                showToast("Tiket berhasil dikirim. Antrean teknisi dan status aset sedang disinkronkan.", "success");
            } catch (error) {
                console.error("Gagal mengirim tiket keluhan:", error);
                let pesan = "Tiket gagal dikirim.";
                if (error && error.code === 'permission-denied') {
                    pesan = "Tiket ditolak oleh Firestore Rules. Pastikan User boleh membuat troubleTickets miliknya sendiri.";
                } else if (error && error.message) {
                    pesan += " " + error.message;
                }
                showToast(pesan, "error");
            } finally {
                window.__sedangKirimTiket = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
                    submitBtn.innerHTML = tombolAsli || '<i class="fa-solid fa-paper-plane"></i><span>Kirim Tiket Keluhan</span>';
                }
            }
        }

        function kirimNotifikasiTelegramOtomatis(namaAlat, ruangan, keluhan, ticketId = '') {
            const tokenBot = "8639957817:AAGVfrGvDMubnl9xEP0fDVGVcwTjw6ARTro";
            const chatId = "-1004495239180";
            const pesan = `🚨 *LAPORAN KERUSAKAN ALAT MEDIS* 🚨` +
                `📌 *Alat:* ${namaAlat}\n` +
                `🏥 *Ruangan:* ${ruangan}\n` +
                `⚠️ *Keluhan:* ${keluhan}\n` +
                (ticketId ? `🎫 *Tiket:* ${ticketId}\n` : '') +
                `🔴 *Status:* Dalam Perbaikan` +
                `_Segera buka aplikasi MEDIX untuk mengambil tindakan._`;
            const url = `https://api.telegram.org/bot${tokenBot}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(pesan)}&parse_mode=Markdown`;

            // Fire-and-forget dengan timeout. Tidak pernah menahan UI.
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 5000);
                return fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: controller.signal })
                    .then(response => {
                        clearTimeout(timer);
                        if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
                        return true;
                    })
                    .catch(error => {
                        clearTimeout(timer);
                        console.warn("Telegram fetch gagal:", error);
                        // Fallback GET tanpa membaca response; berguna bila CORS response diblokir browser.
                        try {
                            const img = new Image();
                            img.referrerPolicy = 'no-referrer';
                            img.src = url;
                        } catch (fallbackError) {}
                        return false;
                    });
            } catch (error) {
                console.warn("Telegram notification error:", error);
                return Promise.resolve(false);
            }
        }

        function renderDaftarTiketMasuk() {
            const headerRow = document.getElementById('ticket-table-header');
            const body = document.getElementById('table-ticket-body'); 
            if(!headerRow || !body) return;
            
            if (canonicalRole(currentActiveRole) === 'User') {
                headerRow.innerHTML = `<tr><th class="p-3">Alat / Ruangan</th><th class="p-3">Keluhan Masalah</th><th class="p-3 text-center">Foto Before</th><th class="p-3">Waktu Lapor</th><th class="p-3">Status Tiket</th></tr>`;
            } else {
                headerRow.innerHTML = `<tr><th class="p-3">Alat / Ruangan</th><th class="p-3">Keluhan Masalah</th><th class="p-3 text-center">Foto Before</th><th class="p-3">Waktu Lapor</th><th class="p-3">Status Tiket</th><th class="p-3 text-center">Tindakan Lapangan</th></tr>`;
            }

            if(dataTiket.length === 0) { 
                let totalKolom = (canonicalRole(currentActiveRole) === 'User') ? 5 : 6;
                body.innerHTML = `<tr><td colspan="${totalKolom}" class="p-4 text-center text-slate-400 italic">Belum ada laporan kerusakan. Gunakan formulir E-Ticket di atas untuk melaporkan kerusakan alat.</td></tr>`; 
                return; 
            }
            
            body.innerHTML = dataTiket.map(t => {
                const alat = dataAlat.find(a => a.id == t.alatId) || { nama: "Alat Medis", ruangan: "Unit" };
                let aksiAksi = "";
                let formatTglLapor = t.tglLapor ? t.tglLapor.replace('T', ' ') : '-';

                if (canonicalRole(currentActiveRole) !== 'User' && (izinMenu('ticket', 'kerjakan') || izinMenu('ticket', 'selesai') || izinMenu('ticket', 'hapus'))) {
                    if (t.statusTiket !== 'Selesai') {
                        const actionButtons = [];
                        if (izinMenu('ticket', 'kerjakan')) {
                            let textTombolKerja = t.statusTiket === "Sedang Dikerjakan" ? '<i class="fa-solid fa-file-signature"></i> Buka LK' : '<i class="fa-solid fa-wrench"></i> Kerjakan';
                            let warnaTombolKerja = t.statusTiket === "Sedang Dikerjakan" ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700';
                            actionButtons.push(`<button onclick="eksekusiTiketLangsungKerjakan('${t.id}','${t.alatId}')" class="${warnaTombolKerja} text-white font-bold px-2 py-1 rounded-lg text-[10px] transition">${textTombolKerja}</button>`);
                        }
                        if (izinMenu('ticket', 'selesai')) actionButtons.push(`<button onclick="selesaikanTiketTroubleManual('${t.id}','${t.alatId}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded-lg text-[10px] transition"><i class="fa-solid fa-check"></i> Selesai</button>`);
                        if (izinMenu('ticket', 'hapus')) actionButtons.push(`<button onclick="hapusTiketUser('${t.id}', '${t.alatId}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-1 rounded-lg text-[10px] transition" title="Hapus Tiket"><i class="fa-solid fa-trash"></i></button>`);
                        aksiAksi = `<td class="p-3 text-center" data-label="Tindakan"><div class="inline-flex space-x-1">${actionButtons.join('')}</div></td>`;
                    } else {
                        let matchingLk = [...dataPerbaikan, ...dataPM, ...dataInspeksi].find(lk => lk.alatId === t.alatId);
                        let tombolBukaLk = matchingLk ? `<button onclick="bukaLembarKerjaDinamisDarlLog('${matchingLk.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition"><i class="fa-solid fa-file-lines mr-1"></i> Buka LK</button>` : `<span class="text-[10px] text-slate-400 italic">Arsip</span>`;
                        const actionButtons = [`<span class="text-emerald-600 font-bold text-[10px] mr-1">✅ Selesai</span>`];
                        if (matchingLk && izinMenu('ticket', 'kerjakan')) actionButtons.push(tombolBukaLk);
                        if (izinMenu('ticket', 'hapus')) actionButtons.push(`<button onclick="hapusTiketUser('${t.id}', '${t.alatId}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-1 rounded-lg text-[10px] transition ml-1" title="Hapus Tiket"><i class="fa-solid fa-trash"></i></button>`);
                        aksiAksi = `<td class="p-3 text-center" data-label="Tindakan"><div class="inline-flex space-x-1 items-center">${actionButtons.join('')}</div></td>`;
                    }
                }

                let fotoBeforeThm = (t.fotoBefore && t.fotoBefore !== '-') ? `<button onclick="lihatFileLangsung('${t.fotoBefore}','img','Foto Before')" class="bg-slate-100 text-amber-600 px-2 py-1 rounded text-[10px] border border-amber-200"><i class="fa-solid fa-image"></i> Lihat</button>` : `<span class="text-[10px] text-slate-400 italic">Tidak ada</span>`;
                let kelasBadgeStatus = "bg-amber-50 text-amber-700 border border-amber-200";
                if(t.statusTiket === "Selesai") kelasBadgeStatus = "bg-emerald-50 text-emerald-700 border border-emerald-200";
                if(t.statusTiket === "Sedang Dikerjakan") kelasBadgeStatus = "bg-indigo-50 text-indigo-700 border border-indigo-200";

                return `
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                        <td class="p-3" data-label="Alat / Ruangan"><b>${alat.nama}</b><br><span class="text-[10px] text-slate-500">SN: ${alat.seri || '-'} (${alat.ruangan || alat.lokasi || '-'})</span></td>
                        <td class="p-3 text-slate-600 font-mono" data-label="Keluhan Masalah"><span>${t.keluhan}</span></td>
                        <td class="p-3 text-center" data-label="Foto Before">${fotoBeforeThm}</td>
                        <td class="p-3 text-[11px] font-mono text-slate-500" data-label="Waktu Lapor">${formatTglLapor}</td>
                        <td class="p-3" data-label="Status Tiket"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${kelasBadgeStatus}">${t.statusTiket}</span></td>
                        ${aksiAksi}
                    </tr>
                `;
            }).join('');
        }

        function bukaDetailTiket(tiketId) {
            const ticket = dataTiket.find(t => String(t.id) === String(tiketId));
            if (!ticket) { showToast('Detail tiket tidak ditemukan.', 'error'); return; }
            const alat = dataAlat.find(a => String(a.id) === String(ticket.alatId)) || {};
            const role = canonicalRole(currentActiveRole);
            const sheet = document.getElementById('ticket-detail-sheet');
            const content = document.getElementById('ticket-detail-content');
            if (!sheet || !content) return;

            const status = ticket.statusTiket || 'Menunggu Tindakan';
            const currentStep = status === 'Selesai' ? 3 : (status === 'Sedang Dikerjakan' ? 2 : 1);
            const foto = ticket.fotoBefore && ticket.fotoBefore !== '-'
                ? `<img src="${ticket.fotoBefore}" alt="Foto kondisi kerusakan" class="w-full max-h-56 object-contain rounded-xl border border-slate-200 bg-slate-50">`
                : `<div class="h-28 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-xs text-slate-400"><i class="fa-regular fa-image mr-2"></i>Tidak ada foto</div>`;
            const safe = v => escapeHtml(String(v ?? '-'));
            const statusClass = status === 'Selesai' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status === 'Sedang Dikerjakan' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200';

            const step = (n, icon, label) => `<div class="ticket-step ${currentStep >= n ? (currentStep === n ? 'current' : 'done') : ''}"><span class="ticket-step-dot"><i class="fa-solid ${icon}"></i></span><span class="text-[9px] sm:text-[10px] font-bold text-slate-600 text-center">${label}</span></div>`;
            content.innerHTML = `
              <div class="grid grid-cols-1 md:grid-cols-[1.15fr_.85fr] gap-4">
                <div class="space-y-3">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div><p class="text-[9px] uppercase tracking-wider font-black text-slate-400">Alat / Ruangan</p><h4 class="font-black text-slate-900 mt-1">${safe(alat.nama || 'Alat Medis')}</h4><p class="text-[10px] text-slate-500 mt-1">SN: ${safe(alat.seri)} • ${safe(alat.ruangan || alat.lokasi)}</p></div>
                      <span class="px-2 py-1 rounded-lg border text-[9px] font-black ${statusClass}">${safe(status)}</span>
                    </div>
                  </div>
                  <div class="rounded-2xl border border-slate-200 p-4"><p class="text-[9px] uppercase tracking-wider font-black text-slate-400">Keluhan</p><p class="text-xs leading-5 text-slate-700 mt-2 whitespace-pre-wrap">${safe(ticket.keluhan)}</p></div>
                  <div class="rounded-2xl border border-slate-200 p-4"><p class="text-[9px] uppercase tracking-wider font-black text-slate-400 mb-2">Progress Penanganan</p><div class="flex items-start gap-1">${step(1,'fa-paper-plane','Laporan diterima')}<span class="ticket-step-line ${currentStep >= 2 ? 'done':''}"></span>${step(2,'fa-wrench','Dikerjakan')}<span class="ticket-step-line ${currentStep >= 3 ? 'done':''}"></span>${step(3,'fa-circle-check','Selesai')}</div></div>
                  <div class="grid grid-cols-2 gap-3 text-[10px]"><div class="rounded-xl bg-slate-50 p-3"><span class="text-slate-400 block">Waktu Lapor</span><b class="text-slate-700">${safe(ticket.tglLapor)}</b></div><div class="rounded-xl bg-slate-50 p-3"><span class="text-slate-400 block">Pelapor</span><b class="text-slate-700">${safe(ticket.pelaporNama || currentUserNama || '-')}</b></div></div>
                </div>
                <div class="rounded-2xl border border-slate-200 p-3"><p class="text-[9px] uppercase tracking-wider font-black text-slate-400 mb-2">Foto Kondisi Kerusakan</p>${foto}</div>
              </div>
              ${role !== 'User' ? `<div class="mt-4 rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-[10px] text-indigo-800"><i class="fa-solid fa-user-gear mr-1"></i> Mode petugas: tindakan lapangan tersedia dari daftar tiket sesuai permission akun.</div>` : ''}
            `;
            sheet.classList.add('show');
            sheet.setAttribute('aria-hidden','false');
            document.body.classList.add('overflow-hidden');
        }

        function tutupDetailTiket(e) {
            if (e && e.target && e.target.id !== 'ticket-detail-sheet') return;
            const sheet = document.getElementById('ticket-detail-sheet');
            if (!sheet) return;
            sheet.classList.remove('show');
            sheet.setAttribute('aria-hidden','true');
            document.body.classList.remove('overflow-hidden');
        }

        async function hapusTiketUser(tiketId, alatId) {
            if (!izinMenu('ticket', 'hapus')) { showToast('Anda tidak memiliki izin menghapus tiket.', 'error'); return; }
            if(await showConfirmDialog("Batalkan atau hapus laporan kerusakan ini? Status alat akan dikembalikan menjadi Siap Pakai.", { title: "Batalkan Laporan Kerusakan", okText: "Ya, Batalkan", icon: "fa-trash-can" })) {
                db.collection("troubleTickets").doc(tiketId).delete().then(() => {
                    return db.collection("dataAlat").doc(alatId).update({ status: "Siap Digunakan" }).catch(err => console.warn('Status aset tidak dapat dipulihkan:', err));
                }).then(() => { showToast("Laporan kerusakan dibatalkan.", "info"); }).catch(err => showToast('Gagal membatalkan tiket: ' + (err.message || ''), 'error'));
            }
        }

        async function eksekusiTiketLangsungKerjakan(tiketId, alatId) {
            if (!izinMenu('ticket', 'kerjakan')) { showToast('Anda tidak memiliki izin mengerjakan tiket.', 'error'); return; }
            const targetTiket = dataTiket.find(t => t.id === tiketId);
            bukaLembarKerjaBaruKosong();
            document.getElementById('dlk-selected-alat-id').value = alatId;
            sinkronisasiDataAlatKeWorksheet(alatId);
            document.querySelectorAll('input[name="dlk-jenis"]').forEach(r => { if(r.value === "Corrective Maintenance") r.checked = true; });
            stringFotoBeforeBase64 = (targetTiket && targetTiket.fotoBefore) ? targetTiket.fotoBefore : "-";
            const boxBefore = document.getElementById('box-preview-foto-before');
            if(stringFotoBeforeBase64 !== '-') { boxBefore.innerHTML = `<img src="${stringFotoBeforeBase64}" class="max-w-full max-h-full w-auto h-auto object-contain rounded" style="display:block;">`; }
            else { boxBefore.innerHTML = `[ Tidak Ada Foto Before ]`; }

            try {
                await db.collection("troubleTickets").doc(tiketId).update({ statusTiket: "Sedang Dikerjakan" });
                try {
                    await db.collection("dataAlat").doc(alatId).update({
                        status: "Dalam Perbaikan",
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (assetError) {
                    console.warn("Status aset tidak dapat diperbarui saat tiket diambil:", assetError);
                }
            } catch (error) {
                console.error("Gagal mengubah status tiket:", error);
                showToast("LK dibuka, tetapi status tiket belum dapat diperbarui.", "warning");
            }
        }

        function jadwalkanRekonsiliasiStatusAset(delay = 350) {
            if (rekonsiliasiStatusTimer) clearTimeout(rekonsiliasiStatusTimer);
            rekonsiliasiStatusTimer = setTimeout(() => {
                rekonsiliasiStatusTimer = null;
                rekonsiliasiStatusAsetDariTicketDanLK().catch(error => {
                    console.warn('Rekonsiliasi status aset gagal:', error);
                });
            }, delay);
        }

        async function rekonsiliasiStatusAsetDariTicketDanLK() {
            // Hanya staff yang boleh melakukan pemulihan status otomatis.
            if (currentActiveRole !== 'Admin' && currentActiveRole !== 'Teknisi') return;
            if (!Array.isArray(dataAlat) || !Array.isArray(dataTiket) || !Array.isArray(dataLembarKerja)) return;
            if (!dataAlat.length) return;

            const selesaiTicketByAlat = new Set();
            dataTiket.forEach(ticket => {
                if (ticket.alatId && ticket.statusTiket === 'Selesai') {
                    selesaiTicketByAlat.add(String(ticket.alatId));
                }
            });

            const lkBaikByAlat = new Set();
            dataLembarKerja.forEach(lk => {
                const hasil = String(lk.hasilTunggal || '');
                if (lk.alatId && hasil && !hasil.includes('Rusak')) {
                    lkBaikByAlat.add(String(lk.alatId));
                }
            });

            const batch = db.batch();
            let changed = 0;

            dataAlat.forEach(asset => {
                const assetId = String(asset.id || '');
                if (!assetId || asset.status !== 'Dalam Perbaikan') return;

                // Jangan memulihkan aset jika masih ada ticket aktif.
                const masihAdaTicketAktif = dataTiket.some(ticket =>
                    String(ticket.alatId || '') === assetId &&
                    ticket.statusTiket !== 'Selesai'
                );
                if (masihAdaTicketAktif) return;

                // Kondisi stale yang aman dipulihkan:
                // ticket sudah Selesai ATAU LK terakhir yang baik sudah ada.
                if (!selesaiTicketByAlat.has(assetId) && !lkBaikByAlat.has(assetId)) return;

                batch.update(db.collection('dataAlat').doc(asset.id), {
                    status: 'Siap Digunakan',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                batch.set(db.collection('equipment').doc(asset.id), {
                    status: 'Siap Digunakan',
                    kondisi: 'Baik',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                changed++;
            });

            if (changed > 0) {
                await batch.commit();
                console.info(`Rekonsiliasi status aset: ${changed} aset dikembalikan ke Siap Digunakan.`);
            }
        }

        async function selesaikanTiketTroubleManual(tiketId, alatId) {
            if (!izinMenu('ticket', 'selesai')) { showToast('Anda tidak memiliki izin menyelesaikan tiket.', 'error'); return; }
            if (!await showConfirmDialog("Apakah Anda ingin menyelesaikan trouble ticket ini dan mengubah status alat menjadi Siap Pakai?", { title: "Selesaikan Trouble Ticket", okText: "Ya, Selesaikan", variant: "safe", icon: "fa-circle-check" })) return;

            try {
                // Ticket + Master Aset harus berhasil bersama-sama.
                // Ini mencegah ticket berstatus Selesai sementara dashboard
                // masih menghitung alat sebagai Dalam Perbaikan.
                const batch = db.batch();
                const ticketRef = db.collection("troubleTickets").doc(tiketId);
                const assetRef = db.collection("dataAlat").doc(alatId);

                batch.update(ticketRef, {
                    statusTiket: "Selesai",
                    selesaiAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                batch.update(assetRef, {
                    status: "Siap Digunakan",
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Projection equipment ikut dipulihkan agar semua modul lama
                // yang masih membaca equipment tidak tertinggal status Trouble.
                const equipmentRef = db.collection('equipment').doc(alatId);
                batch.set(equipmentRef, {
                    status: 'Siap Digunakan',
                    kondisi: 'Baik',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                await batch.commit();

                // Optimistic UI: langsung hilangkan counter Trouble sambil
                // menunggu snapshot realtime Firestore.
                const assetIndex = dataAlat.findIndex(a => String(a.id) === String(alatId));
                if (assetIndex >= 0) dataAlat[assetIndex].status = "Siap Digunakan";
                const ticketIndex = dataTiket.findIndex(t => String(t.id) === String(tiketId));
                if (ticketIndex >= 0) dataTiket[ticketIndex].statusTiket = "Selesai";

                updateStats();
                renderDaftarTiketMasuk();
                jadwalkanRenderAll(0);
                showToast("Tiket selesai. Status alat kembali menjadi Siap Digunakan.", "success");
            } catch (error) {
                console.error("Gagal menyelesaikan tiket dan mengembalikan status aset:", error);
                let pesan = "Tiket belum diselesaikan karena status alat gagal diperbarui.";
                if (error && error.code === 'permission-denied') {
                    pesan += " Periksa Rules dataAlat dan pastikan akun Teknisi/Admin memiliki izin update.";
                } else if (error && error.message) {
                    pesan += " " + error.message;
                }
                showToast(pesan, "error");
            }
        }

        function renderAll() {
            syncMasterHeaderActions();
            updateStats(); renderBHPTable(); populasikanDropdownBHPDiLK(); populasikanDropdownAlatDiKalibrasi(); populasikanDropdownAlatDiWorksheet(); populasikanDropdownEtiketAlat();
            const tbody = document.getElementById('table-alat-body'); if(!tbody) return;
            let filteredAlat = dataAlat; if(globalFilterStatus !== "all") filteredAlat = dataAlat.filter(a => a.status === globalFilterStatus);
            
            const kalibrasiTerakhirByAlat = new Map();
            (Array.isArray(dataKalibrasi) ? dataKalibrasi : []).forEach(c => {
                const key = String(c.alatId || '');
                if (!key) return;
                const current = kalibrasiTerakhirByAlat.get(key);
                if (!current || String(c.exp || '') > String(current.exp || '')) kalibrasiTerakhirByAlat.set(key, c);
            });

            tbody.innerHTML = filteredAlat.map(a => {
                const lastCal = kalibrasiTerakhirByAlat.get(String(a.id));
                let infoCal = `<br><span class="text-[9px] text-slate-400 italic">Belum Kalibrasi</span>`;
                if(lastCal) { infoCal = `<br><span class="text-[9px] text-indigo-600 font-bold font-mono">Cal Exp: ${lastCal.exp}</span>`; }
                
                let dNama = a.nama || '-', dMerk = a.merk || '-', dTipe = a.tipe || '-', dSeri = a.seri || '-', dIzin = a.izinEdar || a.edar || '-', dLokasi = a.ruangan || a.lokasi || '-';
                let aksiManajemenHTML = "";
                const canMasterEdit = izinMenu('master', 'edit');
                const canMasterDelete = izinMenu('master', 'hapus');
                const actionButtons = [];
                if (canMasterEdit) actionButtons.push(`<button onclick="pemicuEditAlatLangsung('${a.id}')" class="bg-amber-50 text-amber-600 px-3 py-2 text-[11px] hover:bg-amber-100 transition border-r border-slate-200" title="Edit Aset"><i class="fa-solid fa-pen-to-square"></i></button>`);
                actionButtons.push(`<button onclick="bukaKartuPemeliharaan('${a.id}')" class="bg-blue-50 text-blue-600 px-3 py-2 text-[11px] hover:bg-blue-100 transition ${canMasterDelete || canMasterEdit ? 'border-r border-slate-200' : ''}" title="Log Pemeliharaan"><i class="fa-solid fa-book-medical"></i></button>`);
                if (canMasterDelete) actionButtons.push(`<button onclick="hapAlatMasterFirebase('${a.id}', '${String(a.nama || '').replace(/'/g, '&#39;')}')" class="bg-rose-50 text-rose-600 px-3 py-2 text-[11px] hover:bg-rose-100 transition" title="Hapus Aset"><i class="fa-solid fa-trash"></i></button>`);
                aksiManajemenHTML = `<div class="inline-flex rounded-xl border border-slate-200 overflow-hidden">${actionButtons.join('')}</div>`;

                return `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 text-slate-700">
                        <td class="p-3 font-bold text-slate-900">${dNama}</td>
                        <td class="p-3">${dMerk}</td>
                        <td class="p-3">${dTipe}</td>
                        <td class="p-3 font-mono font-bold">${dSeri}</td>
                        <td class="p-3 font-mono text-cyan-700">${dIzin}</td>
                        <td class="p-3">${dLokasi}</td>
                        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.status==='Siap Digunakan'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-rose-50 text-rose-700 border border-rose-200'}">${a.status || 'Siap Pakai'}</span>${infoCal}</td>
                        <td class="p-3 text-center">${aksiManajemenHTML}</td>
                    </tr>
                `;
            }).join('');
            renderTabelPusatDokumen();
        }

        async function simpanPenuhIsianWorksheetDinamis() {
            if (currentActiveRole === 'User') {
                showToast('Akses ditolak! Akun User hanya dapat melihat Lembar Kerja.', 'error');
                return;
            }

            const alatIdRaw = document.getElementById('dlk-selected-alat-id')?.value || '';
            if (!alatIdRaw) {
                showToast('Belum ada alat yang terpilih pada Lembar Kerja ini!', 'error');
                return;
            }

            const tekNama = document.getElementById('dlk-select-nama-teknisi')?.value || '';
            if (!tekNama || tekNama === 'tambah-teknisi-baru') {
                showToast('Silakan pilih Nama Teknisi!', 'error');
                return;
            }

            const jenisEl = document.querySelector('input[name="dlk-jenis"]:checked');
            const hasilEl = document.querySelector('input[name="dlk-hasil-tunggal"]:checked');
            if (!jenisEl || !hasilEl) {
                showToast('Jenis pekerjaan dan hasil pemeriksaan wajib dipilih.', 'error');
                return;
            }

            const btnSimpan = document.getElementById('btn-simpan-lk-aksi');
            if (btnSimpan?.dataset.saving === '1') return;
            if (btnSimpan) {
                btnSimpan.dataset.saving = '1';
                btnSimpan.disabled = true;
                btnSimpan.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Menyimpan...';
            }

            const existingFirebaseId = document.getElementById('dlk-firebase-id')?.value || '';
            const tglKalibrasiInput = document.getElementById('dlk-tglcal')?.value || '';
            const tglExpKalibrasiInput = document.getElementById('dlk-nokal')?.value || '';
            const tglText = document.getElementById('dlk-tgl')?.value || new Date().toISOString().substring(0,10);
            const tglLek = new Date(tglText + 'T00:00:00');
            const hariVal = tglLek.getDate();
            const bulanVal = tglLek.getMonth() + 1;

            const payload = {
                alatId: alatIdRaw,
                noLk: document.getElementById('dlk-no')?.value || '',
                textTgl: tglText,
                desc_kerja: medixBuildDescKerja(),
                keluhan: medixGetStructuredUraian().keluhan,
                penyebab: medixGetStructuredUraian().penyebab,
                pengecekan: medixGetStructuredUraian().pengecekan,
                solusi: medixGetStructuredUraian().solusi,
                pemeriksaanKinerja: Array.isArray(pemeriksaanKinerjaLK) ? pemeriksaanKinerjaLK.map(r=>({...r})) : [],
                jenisKerja: jenisEl.value,
                hasilTunggal: hasilEl.value,
                ttdTeknisi: document.getElementById('sig-teknisi')?.toDataURL() || '',
                ttdUser: document.getElementById('sig-user')?.toDataURL() || '',
                ttdPJ: document.getElementById('sig-pj')?.toDataURL() || '',
                teknisiTtd: tekNama,
                saksiTtd: document.getElementById('dlk-select-nama-saksi')?.value || '',
                pjTtd: 'Arrief Nurcahyo, S.Tr.Em.',
                fotoAlat: stringFotoBase64 || '-',
                fotoBefore: stringFotoBeforeBase64 || '-',
                paramAlatKerja: JSON.stringify(terpakaiAlatKerja),
                paramFisik: JSON.stringify(terpakaiFisik),
                paramFungsi: JSON.stringify(terpakaiFungsi),
                bhpUsage: Array.isArray(bhpUsageLK) ? bhpUsageLK.map(u => ({...u, qty: angkaBHP(u.qty)})) : [],
                tglKalibrasi: tglKalibrasiInput,
                tglExpKalibrasi: tglExpKalibrasiInput,
                isLocked: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const newStatus = payload.hasilTunggal === 'Alat Rusak Perlu Perbaikan'
                ? 'Dalam Perbaikan'
                : 'Siap Digunakan';

            try {
                // Siapkan seluruh perubahan utama terlebih dahulu agar LK + status aset
                // + penutupan ticket berhasil sebagai satu commit Firestore.
                let lkRef;
                if (existingFirebaseId) {
                    lkRef = db.collection('lembarKerja').doc(existingFirebaseId);
                } else {
                    const nextNumber = dataLembarKerja.reduce((max, item) => {
                        const m = String(item.noLk || '').match(/LK-(\d+)$/i);
                        return m ? Math.max(max, Number(m[1])) : max;
                    }, 0) + 1;
                    payload.noLk = 'RSUDPG/IPSRS/LK-' + String(nextNumber).padStart(3, '0');
                    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    lkRef = db.collection('lembarKerja').doc();
                }

                let ticketSnap = null;
                if (newStatus === 'Siap Digunakan') {
                    ticketSnap = await db.collection('troubleTickets')
                        .where('alatId', '==', alatIdRaw)
                        .get();
                }

                const batch = db.batch();

                if (existingFirebaseId) {
                    batch.update(lkRef, payload);
                } else {
                    batch.set(lkRef, payload);
                }

                batch.update(db.collection('dataAlat').doc(alatIdRaw), {
                    status: newStatus,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                await sinkronkanTransaksiBHPUntukLK(existingFirebaseId || lkRef.id, payload.bhpUsage || [], batch, payload.noLk, alatIdRaw, tglText);

                if (ticketSnap) {
                    ticketSnap.forEach(docT => {
                        const d = docT.data() || {};
                        if (d.statusTiket !== 'Selesai') {
                            batch.update(docT.ref, {
                                statusTiket: 'Selesai',
                                selesaiAt: firebase.firestore.FieldValue.serverTimestamp(),
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    });
                }

                await batch.commit();
                // Perbarui projection Rekam Jejak publik agar scan kamera tanpa login
                // langsung melihat LK terbaru. Tidak mengganggu penyimpanan utama bila gagal.
                medixSyncCurrentAssetPublicHistory(alatIdRaw);

                // Kalibrasi adalah dokumen tambahan; jika gagal, LK utama tetap tersimpan.
                if (tglKalibrasiInput && tglExpKalibrasiInput) {
                    try {
                        await db.collection('dataKalibrasi').add({
                            alatId: alatIdRaw,
                            tgl: tglKalibrasiInput,
                            exp: tglExpKalibrasiInput,
                            vendor: 'Internal / UPTD RSUD Pondokgede (' + payload.noLk + ')',
                            certPdf: '-',
                            hasil: payload.hasilTunggal.includes('Rusak') ? 'Alat Tidak Laik Digunakan' : 'Alat Laik Digunakan',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    } catch (calError) {
                        console.warn('Kalibrasi tidak tersimpan:', calError);
                    }
                }
                // Sertifikat/kalibrasi juga masuk projection publik setelah tersimpan.
                medixSyncCurrentAssetPublicHistory(alatIdRaw);

                // Projection equipment hanya cache/kompatibilitas.
                try {
                    await db.collection('equipment').doc(alatIdRaw).set({
                        status: newStatus,
                        hari: hariVal,
                        bulan: bulanVal,
                        teknisi: tekNama,
                        kondisi: payload.hasilTunggal.includes('Rusak') ? 'Kurang Baik' : 'Baik',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                } catch (equipmentError) {
                    console.warn('Projection equipment tidak dapat diperbarui:', equipmentError);
                }

                document.getElementById('area-lembar-kerja-resmi')?.classList.add('hidden');
                showToast(`Lembar Kerja ${payload.noLk} berhasil disimpan dan masuk rekapan.`, 'success');
                jadwalkanRenderAll();
            } catch (error) {
                console.error('Gagal menyimpan LK:', error);
                const code = error?.code ? ` [${error.code}]` : '';
                showToast('Lembar Kerja gagal disimpan: ' + (error.message || 'periksa koneksi dan Security Rules.') + code, 'error');
            } finally {
                if (btnSimpan) {
                    btnSimpan.dataset.saving = '0';
                    btnSimpan.disabled = false;
                    btnSimpan.innerHTML = 'Simpan Data';
                }
            }
        }

        function bukaLembarKerjaBaruKosong() {
            if (!izinMenu('lk','create')) { showToast('Anda tidak memiliki izin membuat LK.', 'error'); return; }
            const areaLK = document.getElementById('area-lembar-kerja-resmi'); if(!areaLK) return;
            document.getElementById('dlk-firebase-id').value = ""; stringFotoBase64 = "-"; stringFotoBeforeBase64 = "-";
            resetFotoAfterDisplay();
            terpakaiAlatKerja = []; terpakaiFisik = []; terpakaiFungsi = []; bhpUsageLK = []; renderBHPUsageLK();
            const now = new Date();
            const offsetMs = now.getTimezoneOffset() * 60 * 1000;
            const localIso = new Date(now.getTime() - offsetMs).toISOString().substring(0, 16);
            const inputTgl = document.getElementById('dlk-tgl');
            if(inputTgl) inputTgl.value = localIso; 
            ['dlk-uraian-keluhan','dlk-uraian-penyebab','dlk-uraian-pengecekan','dlk-uraian-solusi'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';el.removeAttribute('disabled');}});
            resetPemeriksaanKinerjaLK();
            const boxBefore = document.getElementById('box-preview-foto-before');
            if(boxBefore) boxBefore.innerHTML = `[ Tidak Ada Foto Before ]`;
            const selectedAlatId = document.getElementById('dlk-selected-alat-id');
            if(selectedAlatId) selectedAlatId.value = "";
            const inputSearchAlat = document.getElementById('input-search-alat-worksheet');
            if(inputSearchAlat) inputSearchAlat.value = "";
            
            ['dlk-nama', 'dlk-merk', 'dlk-tipe', 'dlk-seri', 'dlk-lokasi', 'dlk-tglcal', 'dlk-nokal'].forEach(id => {
                const el = document.getElementById(id);
                if(el) { el.value = ""; el.removeAttribute('disabled'); }
            });

            const kepalaInput = document.getElementById('dlk-kepala-ruangan-nama');
            const kepalaHidden = document.getElementById('dlk-select-nama-saksi');
            if(kepalaInput) kepalaInput.value = '';
            if(kepalaHidden) kepalaHidden.value = '';
            renderOpsiDropdownAwal(); 
            aktualisasikanTampilanKotakTabel('alatkerja'); 
            aktualisasikanTampilanKotakTabel('fisik'); 
            aktualisasikanTampilanKotakTabel('fungsi'); 
            populasikanDropdownNamaTandaTangan();
            inisialisasiInputKepalaRuanganWorksheet();
            setPenanggungJawabAlkesOtomatis();
            
            // Tidak perlu membaca seluruh koleksi LK hanya untuk nomor sementara.
            // Nomor final ditentukan kembali saat penyimpanan berdasarkan cache LK yang sudah ada.
            const nextNo = dataLembarKerja.reduce((max, item) => {
                const m = String(item.noLk || '').match(/LK-(\d+)$/i);
                return m ? Math.max(max, Number(m[1])) : max;
            }, 0) + 1;
            const elNo = document.getElementById('dlk-no');
            if(elNo) elNo.value = "RSUDPG/IPSRS/LK-" + String(nextNo).padStart(3, '0');
            
            bukaKunciTotalFormWorksheetBaru();
            areaLK.classList.remove('hidden'); areaLK.scrollTop = 0;
            setTimeout(() => { initSignatures(); }, 300); 
            toggleSidebarMenu(false); 
        }

        function bukaKunciTotalFormWorksheetBaru() {
            const area = document.getElementById('area-lembar-kerja-resmi');
            if(area) area.classList.remove('medix-lk-locked');
            const teknisiDisplay = document.getElementById('medix-lk-teknisi-display');
            const teknisiSelect = document.getElementById('dlk-select-nama-teknisi');
            if(teknisiDisplay) teknisiDisplay.remove();
            if(teknisiSelect) teknisiSelect.style.removeProperty('display');
            const btnDownloadPdf = document.getElementById('btn-download-lk-pdf');
            if(btnDownloadPdf) { btnDownloadPdf.classList.add('hidden'); btnDownloadPdf.style.display = 'none'; }
            const btnSimpanLk = document.getElementById('btn-simpan-lk-aksi');
            if(btnSimpanLk) btnSimpanLk.style.display = 'inline-block';
            ['btn-clear-sig-teknisi', 'btn-clear-sig-user', 'btn-clear-sig-pj'].forEach(id => {
                const b = document.getElementById(id); if(b) b.style.display = 'inline-block';
            });
            ['container-drop-alatkerja', 'container-drop-fisik', 'container-drop-fungsi'].forEach(id => {
                const d = document.getElementById(id); if(d) d.style.display = 'block';
            });
            ['dlk-uraian-keluhan','dlk-uraian-penyebab','dlk-uraian-pengecekan','dlk-uraian-solusi'].forEach(id=>document.getElementById(id)?.removeAttribute('disabled'));
            if(area) area.querySelectorAll('input, select, textarea').forEach(el => el.removeAttribute('disabled'));
        }

        function terapkanModeLockedPermanenLk() {
            const area = document.getElementById('area-lembar-kerja-resmi');
            if(area) area.classList.add('medix-lk-locked');
            const teknisiSelect = document.getElementById('dlk-select-nama-teknisi');
            if(teknisiSelect){
                let teknisiDisplay = document.getElementById('medix-lk-teknisi-display');
                if(!teknisiDisplay){
                    teknisiDisplay = document.createElement('div');
                    teknisiDisplay.id = 'medix-lk-teknisi-display';
                    teknisiDisplay.className = 'medix-lk-teknisi-display';
                    teknisiSelect.parentNode.insertBefore(teknisiDisplay, teknisiSelect);
                }
                teknisiDisplay.textContent = teknisiSelect.value || '-';
                teknisiSelect.style.setProperty('display','none','important');
            }
            const btnDownloadPdf = document.getElementById('btn-download-lk-pdf');
            if(btnDownloadPdf) { btnDownloadPdf.classList.remove('hidden'); btnDownloadPdf.style.display = 'inline-flex'; }
            const btnSimpanLk = document.getElementById('btn-simpan-lk-aksi');
            if(btnSimpanLk) btnSimpanLk.style.display = 'none';
            ['btn-clear-sig-teknisi', 'btn-clear-sig-user', 'btn-clear-sig-pj'].forEach(id => {
                const b = document.getElementById(id); if(b) b.style.display = 'none';
            });
            ['container-drop-alatkerja', 'container-drop-fisik', 'container-drop-fungsi'].forEach(id => {
                const d = document.getElementById(id); if(d) d.style.display = 'none';
            });
            ['dlk-uraian-keluhan','dlk-uraian-penyebab','dlk-uraian-pengecekan','dlk-uraian-solusi'].forEach(id=>document.getElementById(id)?.setAttribute('disabled','true'));
            setTimeout(() => {
                const area = document.getElementById('area-lembar-kerja-resmi');
                if(area) area.querySelectorAll('input, select, textarea').forEach(el => el.setAttribute('disabled', 'true'));
            }, 50);
        }

        function bukaLembarKerjaDinamisDarlLog(id) {
            if (!izinMenu('lk','read')) { showToast('Anda tidak memiliki izin melihat LK.', 'error'); return; }
            let record = dataPerbaikan.find(r => r.id == id) || dataPM.find(p => p.id == id) || dataInspeksi.find(i => i.id == id);
            if(!record) { showToast("Dokumen lembar kerja tidak ditemukan.", "error"); return; }
            document.getElementById('dlk-firebase-id').value = record.id; 
            document.querySelectorAll('input[name="dlk-jenis"]').forEach(radio => { if(radio.value === record.jenisKerja) radio.checked = true; });
            document.getElementById('dlk-no').value = record.noLk || ""; 
            document.getElementById('dlk-tgl').value = record.textTgl || (record.tgl ? record.tgl.substring(0,16) : '');
            
            sinkronisasiDataAlatKeWorksheet(record.alatId); 
            if(record.tglKalibrasi) document.getElementById('dlk-tglcal').value = record.tglKalibrasi;
            if(record.tglExpKalibrasi) document.getElementById('dlk-nokal').value = record.tglExpKalibrasi;

            medixLoadStructuredUraian(record);
            try {
                const savedPfa = typeof record.pemeriksaanKinerja === 'string' ? JSON.parse(record.pemeriksaanKinerja || '[]') : record.pemeriksaanKinerja;
                pemeriksaanKinerjaLK = Array.isArray(savedPfa) && savedPfa.length ? savedPfa.map(r=>({...r, nama:r.nama||'', satuan:r.satuan||MEDIX_PFA_UNITS[medixNormText(r.nama||'')]||''})) : (()=>{const t=medixGetPfaTemplateForAsset(document.getElementById('dlk-nama')?.value||''); return t.length?t.map(x=>({...x,setting:'',t1:'',t2:'',t3:'',acuan:'',status:''})): [{pfa:'',nama:'',satuan:'',setting:'',t1:'',t2:'',t3:'',acuan:'',status:''}];})();
            } catch(e) {
                {const t=medixGetPfaTemplateForAsset(document.getElementById('dlk-nama')?.value||''); pemeriksaanKinerjaLK=t.length?t.map(x=>({...x,setting:'',t1:'',t2:'',t3:'',acuan:'',status:''})): [{pfa:'',nama:'',satuan:'',setting:'',t1:'',t2:'',t3:'',acuan:'',status:''}];}
            }
            renderPemeriksaanKinerjaLK();
            
            try { terpakaiAlatKerja = JSON.parse(record.paramAlatKerja || '[]').map(i => typeof i === 'string' ? {nama: i} : i); } catch(e){ terpakaiAlatKerja = []; }
            try { terpakaiFisik = JSON.parse(record.paramFisik || '[]').map(i => typeof i === 'string' ? {nama: i, status: 'Baik'} : i); } catch(e){ terpakaiFisik = []; }
            try { terpakaiFungsi = JSON.parse(record.paramFungsi || '[]').map(i => typeof i === 'string' ? {nama: i, status: 'Baik'} : i); } catch(e){ terpakaiFungsi = []; }
            bhpUsageLK = Array.isArray(record.bhpUsage) ? record.bhpUsage.map(u => ({
                ...u,
                qty: angkaBHP(u.qty)
            })) : [];
            renderBHPUsageLK();
            
            aktualisasikanTampilanKotakTabel('alatkerja'); 
            aktualisasikanTampilanKotakTabel('fisik'); 
            aktualisasikanTampilanKotakTabel('fungsi');
            
            if(record.fotoAlat && record.fotoAlat !== '-') { 
                stringFotoBase64 = record.fotoAlat;
                document.getElementById('box-preview-foto').innerHTML = `<img src="${stringFotoBase64}" class="max-w-full max-h-full w-auto h-auto object-contain rounded" style="display:block;">`; 
                document.getElementById('dlk-input-foto-container').style.display = 'none';
                document.getElementById('btn-retake-after').style.display = 'none'; 
            } else { resetFotoAfterDisplay(); }

            stringFotoBeforeBase64 = record.fotoBefore || "-";
            if(stringFotoBeforeBase64 !== '-') {
                document.getElementById('box-preview-foto-before').innerHTML = `<img src="${stringFotoBeforeBase64}" class="max-w-full max-h-full w-auto h-auto object-contain rounded" style="display:block;">`;
            } else { document.getElementById('box-preview-foto-before').innerHTML = `[ Tidak Ada Foto Before ]`; }

            populasikanDropdownNamaTandaTangan();
            document.getElementById('dlk-select-nama-teknisi').value = record.teknisiTtd || "";
            document.getElementById('dlk-select-nama-saksi').value = record.saksiTtd || "";
            const kepalaRuanganInput = document.getElementById('dlk-kepala-ruangan-nama');
            if (kepalaRuanganInput) kepalaRuanganInput.value = record.saksiTtd || "";
            setPenanggungJawabAlkesOtomatis();
            
            terapkanModeLockedPermanenLk();
            renderBHPUsageLK();
            const areaLK = document.getElementById('area-lembar-kerja-resmi'); 
            areaLK.classList.remove('hidden'); areaLK.scrollTop = 0;

            setTimeout(async () => {
                initSignatures();
                if(record.ttdTeknisi) muatTandaTanganKeCanvas('sig-teknisi', record.ttdTeknisi);
                if(record.ttdUser) muatTandaTanganKeCanvas('sig-user', record.ttdUser);
                if(record.ttdPJ) muatTandaTanganKeCanvas('sig-pj', record.ttdPJ);
            }, 300);
        }

        function pemicuCetakDokumen() {
            if (!izinMenu('lk','print')) { showToast('Anda tidak memiliki izin mencetak LK.', 'error'); return; }
            const area = document.getElementById('area-lembar-kerja-resmi');
            if (!area) {
                console.error('Area LK tidak ditemukan.');
                return;
            }
            area.classList.remove('hidden');
            try { siapkanLKUntukCetak(); } catch (err) { console.warn('Persiapan print LK:', err); }
            medixOpenPrintSettings(window, {
                title: 'Lembar Kerja Pemeliharaan',
                mode: 'lk',
                defaultPreset: 'A4',
                defaultOrientation: 'portrait',
                defaultMargin: 5,
                targetSelector: '#area-lembar-kerja-resmi'
            });
        }

        // Fallback: pastikan tombol LK tetap memiliki handler meskipun inline
        // handler pernah tertimpa oleh perubahan template/CSS.
        document.addEventListener('DOMContentLoaded', () => {
            const btnCetakLK = document.querySelector('#area-lembar-kerja-resmi button[onclick*="pemicuCetakDokumen"]');
            if (btnCetakLK && !btnCetakLK.dataset.printBound) {
                btnCetakLK.dataset.printBound = '1';
                btnCetakLK.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    pemicuCetakDokumen();
                });
            }
        });

        function formatTanggalCetakLK(v) {
            if (!v) return '';
            const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (!m) return String(v);
            return `${m[3]}/${m[2]}/${m[1]}`;
        }

        function siapkanLKUntukCetak() {
            const area = document.getElementById('area-lembar-kerja-resmi');
            if (!area) return;

            // PRINT/PREVIEW memakai struktur DATA ALAT KESEHATAN yang sama
            // dengan form input. Jangan membuat baris tanggal baru di luar
            // .lk-calibration-dates karena itu menyebabkan tulisan menjadi double.
            const fields = area.querySelectorAll('.lk-calibration-dates .lk-date-field');
            const cal = document.getElementById('dlk-tglcal');
            const exp = document.getElementById('dlk-nokal');
            const values = [cal?.value || '', exp?.value || ''];

            fields.forEach((field, index) => {
                let value = field.querySelector('.lk-print-date-value-inline');
                if (!value) {
                    value = document.createElement('span');
                    value.className = 'lk-print-date-value-inline';
                    field.appendChild(value);
                }
                value.textContent = formatTanggalCetakLK(values[index]) || '-';
            });

            const pj = document.getElementById('dlk-nama-pj');
            if (pj) pj.textContent = 'Arrief Nurcahyo, S.Tr.Em.';
        }

        window.addEventListener('afterprint', () => {
            document.getElementById('medix-print-settings-modal')?.classList.remove('show');
            document.getElementById('medix-print-settings-modal')?.setAttribute('aria-hidden','true');
            document.querySelectorAll('.lk-print-date-row').forEach(el => el.remove());
            document.querySelectorAll('.lk-print-date-value').forEach(el => el.remove());
            document.querySelectorAll('.lk-print-date-value-inline').forEach(el => el.remove());
            document.querySelectorAll('.lk-print-date-singleline').forEach(el => el.remove());
            document.querySelectorAll('.lk-print-calibration-card').forEach(el => el.classList.remove('lk-print-calibration-card'));
            document.querySelectorAll('.lk-print-calibration-dates').forEach(el => { el.classList.remove('lk-print-calibration-dates'); el.style.removeProperty('overflow'); });
            document.body.classList.remove('medix-lk-printing');
            document.getElementById('area-lembar-kerja-resmi')?.classList.remove('medix-lk-print-ready');
        });

        function muatTandaTanganKeCanvas(canvasId, dataUrl) {
            const canvas = document.getElementById(canvasId);
            if(!canvas || !dataUrl || dataUrl === '-') return;
            const ctx = canvas.getContext('2d');
            const img = new Image(); img.src = dataUrl;
            img.onload = function() { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
        }

        /* =========================================================
           MEDIX LK — TEMPLATE PEMERIKSAAN OTOMATIS PER JENIS ALAT
           Setelah alat dipilih, daftar alat kerja, fisik, dan fungsi
           diisi otomatis berdasarkan nama alat. Item tetap dapat diedit
           manual melalui dropdown/custom item.
           ========================================================= */
        const MEDIX_LK_TEMPLATES = [
            {
                keys: ['high flow', 'airvo', 'nasal cannula', 'hfno'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Kabel Power', 'Flow Meter', 'Chamber', 'Filter', 'Aksesoris'],
                fungsi: ['Display Monitor', 'Switch On/Off', 'Control/Setting', 'Keypad', 'Chamber', 'Flow Meter']
            },
            {
                keys: ['ventilator', 'ventilasi'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'Breathing Circuit', 'Filter', 'Humidifier', 'Trolley/Bracket'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Control/Setting', 'Mode Ventilasi', 'Alarm', 'Flow/O2', 'Patient Circuit']
            },
            {
                keys: ['patient monitor', 'monitor pasien', 'bedside monitor'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'ECG Cable', 'SpO2 Sensor', 'NIBP Cuff', 'Temperature Probe'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Touchscreen/Keypad', 'ECG', 'SpO2', 'NIBP', 'Temperature', 'Alarm']
            },
            {
                keys: ['infusion pump', 'infusion', 'volumetric pump'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'Door/Clamp', 'Occlusion Sensor', 'Air-in-line Sensor'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Keypad', 'Flow Rate Setting', 'Alarm', 'Occlusion', 'Air-in-line']
            },
            {
                keys: ['syringe pump', 'syringe'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'Syringe Holder', 'Pusher/Plunger', 'Clamp'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Keypad', 'Flow Rate Setting', 'Alarm', 'Syringe Detection']
            },
            {
                keys: ['ekg', 'ecg', 'electrocardiograph'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'Patient Cable', 'Electrode Lead', 'Printer'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Keypad', 'ECG Acquisition', 'Paper Feed/Print', 'Alarm']
            },
            {
                keys: ['defibrillator', 'defibrilator', 'aed'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'Paddle/Pad', 'Patient Cable', 'Battery'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Charge', 'Energy Setting', 'Shock', 'ECG', 'Alarm']
            },
            {
                keys: ['suction', 'vacuum', 'aspirator'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Kabel Power', 'Vacuum Bottle', 'Tubing', 'Filter', 'Regulator/Knob', 'Trolley/Bracket'],
                fungsi: ['Power On/Off', 'Vacuum Regulation', 'Vacuum Gauge', 'Suction Flow', 'Alarm/Indicator']
            },
            {
                keys: ['oxygen concentrator', 'konsentrator oksigen'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester', 'Oxygen Analyzer'],
                fisik: ['Main Unit', 'Kabel Power', 'Flowmeter', 'Humidifier Bottle', 'Oxygen Outlet', 'Filter', 'Wheel/Caster'],
                fungsi: ['Power On/Off', 'Flow Setting', 'Oxygen Concentration', 'Flowmeter', 'Alarm/Indicator']
            },
            {
                keys: ['incubator', 'infant incubator', 'baby incubator'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Canopy', 'Mattress', 'Kabel Power', 'Temperature Probe', 'Humidifier', 'Wheel/Caster'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Temperature Setting', 'Humidity Setting', 'Alarm', 'Control/Setting']
            },
            {
                keys: ['autoclave', 'sterilizer'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Chamber', 'Door/Gasket', 'Kabel Power', 'Tray', 'Pressure Gauge'],
                fungsi: ['Power On/Off', 'Temperature Setting', 'Time Setting', 'Pressure', 'Heating', 'Alarm']
            },
            {
                keys: ['ultrasound', 'usg', 'sonography'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'Transducer', 'Probe Cable', 'Keyboard/Control Panel'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Probe Selection', 'Gain/Depth Setting', 'Image Display', 'Measurement']
            },
            {
                keys: ['x-ray', 'xray', 'radiography'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Tube Housing', 'Collimator', 'Kabel Power', 'Table/Stand', 'Control Panel'],
                fungsi: ['Power On/Off', 'Exposure Setting', 'Collimator', 'Exposure', 'Display/Indicator', 'Alarm']
            },
            {
                keys: ['hemoglobin', 'hematology analyzer', 'chemistry analyzer', 'analyzer'],
                alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
                fisik: ['Main Unit', 'Display', 'Kabel Power', 'Sample Port', 'Reagent Area', 'Printer'],
                fungsi: ['Power On/Off', 'Display Monitor', 'Menu/Keypad', 'Sample Processing', 'Result Display', 'Printer']
            }
        ];

        const MEDIX_LK_DEFAULT_TEMPLATE = {
            alatkerja: ['ESA', 'Thermohygrometer', 'Toolset', 'Cleaning Kit', 'Multi Tester'],
            fisik: ['Main Unit', 'Kabel Power', 'Casing/Panel', 'Display/Indicator', 'Konektor/Aksesoris'],
            fungsi: ['Power On/Off', 'Display/Indicator', 'Control/Setting', 'Fungsi Utama', 'Alarm/Indicator']
        };

        function ambilTemplateLK(namaAlat) {
            const nama = String(namaAlat || '').toLowerCase();
            return MEDIX_LK_TEMPLATES.find(t => t.keys.some(k => nama.includes(k))) || MEDIX_LK_DEFAULT_TEMPLATE;
        }

        function terapkanTemplateLKUntukAlat(namaAlat, paksa = true) {
            const template = ambilTemplateLK(namaAlat);
            if (!paksa && (terpakaiAlatKerja.length || terpakaiFisik.length || terpakaiFungsi.length)) return;
            terpakaiAlatKerja = template.alatkerja.map(nama => ({nama, status:'Baik'}));
            terpakaiFisik = template.fisik.map(nama => ({nama, status:'Baik'}));
            terpakaiFungsi = template.fungsi.map(nama => ({nama, status:'Baik'}));
            template.alatkerja.forEach(n => { if(!opsAlatKerja.includes(n)) opsAlatKerja.push(n); });
            template.fisik.forEach(n => { if(!opsFisik.includes(n)) opsFisik.push(n); });
            template.fungsi.forEach(n => { if(!opsFungsi.includes(n)) opsFungsi.push(n); });
            renderOpsiDropdownAwal();
            aktualisasikanTampilanKotakTabel('alatkerja');
            aktualisasikanTampilanKotakTabel('fisik');
            aktualisasikanTampilanKotakTabel('fungsi');
        }

        /* =========================================================
           KEPALA RUANGAN — OTOMATIS DARI RUANGAN ALAT
           Jika mapping belum tersedia, nama dibiarkan kosong.
           LK lama mempertahankan nama tersimpan sebagai snapshot.
           ========================================================= */
        const MEDIX_KEPALA_RUANGAN = [
            { keys: ['instalasi gawat darurat', 'igd'], nama: 'Ns. Titi Handayani, S.Kep.' },
            { keys: ['instalasi bedah sentral', 'ibs'], nama: 'Ns. Anieta Ester Yulia Lukasim, S. Kep.' },
            { keys: ['instalasi perinatologi dan nicu', 'perinatologi', 'nicu'], nama: 'Hilda Izzaty, S. Keb.' },
            { keys: ['kamar bersalin', 'vk'], nama: 'Noviana Maulani, A.Md.Keb.' },
            { keys: ['instalasi rawat inap', 'rawat inap'], nama: 'Pipit Samawati, AMK.' },
            { keys: ['instalasi rawat jalan', 'rawat jalan'], nama: 'Siti Dahlia Gumala, A. Md. Kep.' },
            { keys: ['instalasi icu/hcu', 'icu/hcu', 'icu hcu'], nama: 'Milani Puspasari, AMK.' },
            { keys: ['pelayanan penunjang', 'penunjang'], nama: 'Dhiah Ernawaty, AMK., SAP., M.M.' },
            { keys: ['instalasi farmasi', 'farmasi'], nama: 'Rani Widiastuti, S.Farm., Apt.' },
            { keys: ['instalasi radiologi', 'radiologi'], nama: 'Karisma Rosita, S.Kes.' },
            { keys: ['instalasi laboratorium dan bank darah', 'laboratorium dan bank darah', 'laboratorium', 'bank darah'], nama: 'Yusma Fitriani, AMAK.' },
            { keys: ['instalasi cssd', 'cssd'], nama: 'Rizka Matsari, S.Gz.' },
            { keys: ['instalasi rehab medik', 'rehab medik', 'rehabilitasi medik'], nama: 'Dewa Ayu Chyntia Arini, S.Ft., Ft.' },
            { keys: ['instalasi pemeliharaan sarpras', 'pemeliharaan sarpras', 'sarpras'], nama: 'Enyk Mary Loca, S.T.' },
            { keys: ['instalasi laundry', 'laundry'], nama: 'You Lisma Wulan Dari Beru Bangun, S. Si.' }
        ];

        const MEDIX_PENANGGUNG_JAWAB_ALKES = 'Arrief Nurcahyo, S.Tr.Em.';

        function setPenanggungJawabAlkesOtomatis() {
            const kandidatIds = [
                'dlk-select-nama-penanggung-jawab',
                'dlk-penanggung-jawab',
                'dlk-pj-alkes',
                'dlk-nama-penanggung-jawab'
            ];
            for (const id of kandidatIds) {
                const el = document.getElementById(id);
                if(el) {
                    el.value = MEDIX_PENANGGUNG_JAWAB_ALKES;
                    if(el.tagName === 'SELECT') {
                        const exists = [...el.options].some(o => o.value === MEDIX_PENANGGUNG_JAWAB_ALKES);
                        if(!exists) el.add(new Option(MEDIX_PENANGGUNG_JAWAB_ALKES, MEDIX_PENANGGUNG_JAWAB_ALKES));
                    }
                }
            }
            const textTargets = document.querySelectorAll('[data-penanggung-jawab-alkes]');
            textTargets.forEach(el => el.textContent = MEDIX_PENANGGUNG_JAWAB_ALKES);
            const pjText = document.getElementById('dlk-nama-pj');
            if (pjText) pjText.textContent = MEDIX_PENANGGUNG_JAWAB_ALKES;
        }

        function normalisasiTeksRuangan(v) {
            return String(v || '').toLowerCase()
                .replace(/[.,()\/\\-]+/g, ' ')
                .replace(/\s+/g, ' ').trim();
        }

        function cariKepalaRuangan(namaRuangan) {
            const room = normalisasiTeksRuangan(namaRuangan);
            if(!room || room === '-') return '';
            const found = MEDIX_KEPALA_RUANGAN.find(item =>
                item.keys.some(key => room.includes(normalisasiTeksRuangan(key)))
            );
            return found ? found.nama : '';
        }

        function tampilkanKepalaRuanganWorksheet(nama) {
            const input = document.getElementById('dlk-select-nama-saksi');
            const label = document.getElementById('dlk-kepala-ruangan-nama');
            const nilai = String(nama || '').trim();
            if(input) input.value = nilai;
            if(label) {
                label.value = nilai;
                label.title = nilai;
            }
        }

        function sinkronisasiKepalaRuanganWorksheet(ruangan, namaSnapshot = '') {
            tampilkanKepalaRuanganWorksheet(
                String(namaSnapshot || '').trim() || cariKepalaRuangan(ruangan)
            );
        }

        function inisialisasiInputKepalaRuanganWorksheet() {
            const input = document.getElementById('dlk-kepala-ruangan-nama');
            const hidden = document.getElementById('dlk-select-nama-saksi');
            if(!input) return;
            if(input.dataset.bound === '1') return;
            input.dataset.bound = '1';
            input.addEventListener('input', () => {
                if(hidden) hidden.value = input.value;
            });
        }



        function renderOpsiDropdownAwal() { 
            const dAk = document.getElementById('drop-alatkerja'); const dFs = document.getElementById('drop-fisik'); const dFn = document.getElementById('drop-fungsi');
            if(dAk) dAk.innerHTML = `<option value="">-- PILIH ALAT KERJA --</option>` + opsAlatKerja.map(i => `<option value="${i}">${i}</option>`).join('') + `<option value="tambah-baru">+ Tambah Alat Kerja</option>`; 
            if(dFs) dFs.innerHTML = `<option value="">-- PILIH KONDISI FISIK --</option>` + opsFisik.map(i => `<option value="${i}">${i}</option>`).join('') + `<option value="tambah-baru">+ Tambah Kondisi Fisik</option>`; 
            if(dFn) dFn.innerHTML = `<option value="">-- PILIH KONDISI FUNGSI --</option>` + opsFungsi.map(i => `<option value="${i}">${i}</option>`).join('') + `<option value="tambah-baru">+ Tambah Kondisi Fungsi</option>`; 
        }

        function pilihDropdownAtauInputKustom(kategori, selectEl) {
            const val = selectEl.value;
            if(!val) return;
            if(val === "tambah-baru") {
                document.getElementById('container-drop-' + kategori).classList.add('hidden');
                document.getElementById('input-kustom-container-' + kategori).classList.remove('hidden');
                document.getElementById('input-teks-kustom-' + kategori).value = "";
                document.getElementById('input-teks-kustom-' + kategori).focus();
            } else {
                eksekusiPushPoinUnik(kategori, val);
                selectEl.selectedIndex = 0;
            }
        }

        function simpanItemKustomBaru(kategori) {
            const inputEl = document.getElementById('input-teks-kustom-' + kategori);
            const val = inputEl.value.trim();
            if(val !== "") {
                if(kategori === 'alatkerja' && !opsAlatKerja.includes(val)) opsAlatKerja.push(val);
                if(kategori === 'fisik' && !opsFisik.includes(val)) opsFisik.push(val);
                if(kategori === 'fungsi' && !opsFungsi.includes(val)) opsFungsi.push(val);
                renderOpsiDropdownAwal();
                eksekusiPushPoinUnik(kategori, val);
            }
            batalItemKustomBaru(kategori);
        }

        function batalItemKustomBaru(kategori) {
            document.getElementById('input-kustom-container-' + kategori).classList.add('hidden');
            document.getElementById('container-drop-' + kategori).classList.remove('hidden');
            document.getElementById('drop-' + kategori).selectedIndex = 0;
        }

        function eksekusiPushPoinUnik(kategori, txt) {
            let itemObj = { nama: txt, status: 'Baik' };
            if(kategori === 'alatkerja' && !terpakaiAlatKerja.some(i => i.nama === txt)) terpakaiAlatKerja.push(itemObj);
            if(kategori === 'fisik' && !terpakaiFisik.some(i => i.nama === txt)) terpakaiFisik.push(itemObj);
            if(kategori === 'fungsi' && !terpakaiFungsi.some(i => i.nama === txt)) terpakaiFungsi.push(itemObj);
            aktualisasikanTampilanKotakTabel(kategori);
        }

        function updateStatusPoinCeklis(kategori, idx, valStatus) {
            if(currentActiveRole === 'User') return;
            if(kategori === 'fisik' && terpakaiFisik[idx]) terpakaiFisik[idx].status = valStatus;
            if(kategori === 'fungsi' && terpakaiFungsi[idx]) terpakaiFungsi[idx].status = valStatus;
        }

        function hapusPoinSpesifik(kategori, idx) { 
            if(currentActiveRole === 'User') return; 
            if(kategori === 'alatkerja') terpakaiAlatKerja.splice(idx,1); 
            if(kategori === 'fisik') terpakaiFisik.splice(idx,1); 
            if(kategori === 'fungsi') terpakaiFungsi.splice(idx,1); 
            aktualisasikanTampilanKotakTabel(kategori); 
        }

        function aktualisasikanTampilanKotakTabel(kategori) { 
            const box = document.getElementById('box-list-' + kategori); if(!box) return;
            let arr = (kategori === 'alatkerja') ? terpakaiAlatKerja : (kategori === 'fisik') ? terpakaiFisik : terpakaiFungsi; 
            const isUser = (currentActiveRole === 'User');
            
            box.innerHTML = arr.map((item, i) => {
                let namaItem = typeof item === 'object' ? item.nama : item;
                let statusItem = typeof item === 'object' ? (item.status || 'Baik') : 'Baik';

                if (kategori === 'alatkerja') {
                    return `
                        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 p-1 rounded-lg gap-2 text-[10px]">
                            <span class="flex-1 font-medium truncate text-slate-800">• ${namaItem}</span>
                            ${isUser ? '' : `<button type="button" onclick="hapusPoinSpesifik('${kategori}', ${i})" class="no-print text-rose-500 hover:text-rose-700 font-bold px-1.5 text-xs" title="Hapus Item">×</button>`}
                        </div>
                    `;
                } else {
                    return `
                        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 p-1 rounded-lg gap-2 text-[10px]">
                            <span class="flex-1 font-medium truncate text-slate-800">• ${namaItem}</span>
                            <div class="flex items-center space-x-1 no-print text-slate-700">
                                <label class="cursor-pointer text-[9px]"><input type="radio" name="chk_${kategori}_${i}" ${statusItem==='Baik'?'checked':''} ${isUser?'disabled':''} onclick="updateStatusPoinCeklis('${kategori}', ${i}, 'Baik')"> Baik</label>
                                <label class="cursor-pointer text-[9px]"><input type="radio" name="chk_${kategori}_${i}" ${statusItem==='Tidak'?'checked':''} ${isUser?'disabled':''} onclick="updateStatusPoinCeklis('${kategori}', ${i}, 'Tidak')"> Tidak</label>
                                <label class="cursor-pointer text-[9px]"><input type="radio" name="chk_${kategori}_${i}" ${statusItem==='N/A'?'checked':''} ${isUser?'disabled':''} onclick="updateStatusPoinCeklis('${kategori}', ${i}, 'N/A')"> N/A</label>
                            </div>
                            <span class="print:inline hidden font-bold text-slate-800">[${statusItem}]</span>
                            ${isUser ? '' : `<button type="button" onclick="hapusPoinSpesifik('${kategori}', ${i})" class="no-print text-rose-500 hover:text-rose-700 font-bold px-1.5 text-xs" title="Hapus Item">×</button>`}
                        </div>
                    `;
                }
            }).join(''); 
        }
        

        // ================================================================
        // LK: TEMPLATE PEMERIKSAAN KINERJA ALAT (PFA)
        // ================================================================
        const MEDIX_PFA_TEMPLATES = {"EKG":[{"pfa":"PKA1","nama":"Pengukuran Heartrate","satuan":"Bpm"},{"pfa":"PKA2","nama":"Pengukuran Heartrate","satuan":"Bpm"},{"pfa":"PKA3","nama":"Pengukuran Heartrate","satuan":"Bpm"},{"pfa":"PKA4","nama":"Pengukuran kecepatan kertas","satuan":"m/s"},{"pfa":"PKA5","nama":"Pengukuran sensitivitas","satuan":"mV/mm"}],"USG":[],"INFANT WARMER":[],"CTG":[{"pfa":"PKA1","nama":"Pengukuran Fetal Heartrate","satuan":"Bpm"}],"PATIENT MONITOR":[{"pfa":"PKA1","nama":"Pengukuran Heartrate","satuan":"Bpm"},{"pfa":"PKA2","nama":"Pengukuran Heartrate","satuan":"Bpm"},{"pfa":"PKA3","nama":"Pengukuran Heartrate","satuan":"Bpm"},{"pfa":"PKA4","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA5","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA6","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA7","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA8","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA9","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA10","nama":"Pengukuran Suhu","satuan":"°C"}],"OPERATING TABLE":[{"pfa":"PKA1","nama":"Pengukuran Intensitas Cahaya","satuan":"Lux"}],"DIGITAL RADIOGRAPHY":[{"pfa":"PKA1","nama":"Pengukuran kebocoran radiasi","satuan":"mSv"}],"AUTOCLAVE":[{"pfa":"PKA1","nama":"Pengukuran Suhu","satuan":"°C"},{"pfa":"PKA2","nama":"Pengukuran Pressure","satuan":"mmHg"}],"DENTAL UNIT":[],"INFANT INCUBATOR":[{"pfa":"PKA1","nama":"Pengukuran Suhu","satuan":"°C"},{"pfa":"PKA2","nama":"Pengukuran Kelembaban","satuan":""}],"VENTILATOR":[],"VENTILATOR TRANSPORT":[],"X-RAY MOBILE":[],"VITAL SIGN MONITOR":[{"pfa":"PKA1","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA2","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA3","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA4","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA5","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA6","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA7","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA8","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA9","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA10","nama":"Pengukuran Suhu","satuan":"°C"}],"ESU":[],"NEBULIZER":[],"INFUSION PUMP":[{"pfa":"PKA1","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA2","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA3","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA4","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA5","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA6","nama":"Pengukuran occlusion","satuan":"PSI"}],"SYRINGE PUMP":[{"pfa":"PKA1","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA2","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA3","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA4","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA5","nama":"Pengukuran flow rate","satuan":"ml/h"},{"pfa":"PKA6","nama":"Pengukuran occlusion","satuan":"PSI"}],"SUCTION PUMP":[{"pfa":"PKA1","nama":"Pengukuran Pressure","satuan":"mmHg"}],"REFRIGERATOR MEDICAL":[{"pfa":"PKA1","nama":"Pengukuran suhu","satuan":"°C"}],"ROLLER MIXER":[{"pfa":"PKA1","nama":"Pengukuran kecepatan motor","satuan":""}],"CENTRIFUGE":[{"pfa":"PKA1","nama":"Pengukuran kecepatan motor","satuan":""}],"FREEZER MEDICAL":[{"pfa":"PKA1","nama":"Pengukuran suhu","satuan":"°C"}],"ELEKTRIK BED":[],"FILM VIEWER":[],"HFNC":[{"pfa":"PKA1","nama":"Pengukuran flow rate","satuan":"ml/h"}],"EXAMINATION LAMP":[{"pfa":"PKA1","nama":"Pengukruan intensitas cahaya","satuan":""}],"STEAM STERILIZER":[{"pfa":"PKA1","nama":"Pengukuran suhu","satuan":"°C"}],"AED":[{"pfa":"PKA1","nama":"Pengukuran energi","satuan":"Joule"},{"pfa":"PKA2","nama":"Pengukuran energi","satuan":"Joule"},{"pfa":"PKA3","nama":"Pengukuran energi","satuan":"Joule"},{"pfa":"PKA4","nama":"Pengukuran energi","satuan":"Joule"},{"pfa":"PKA5","nama":"Pengukuran energi","satuan":"Joule"}],"TENSIMETER MANUAL":[{"pfa":"PKA1","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA2","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA3","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA4","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA5","nama":"Pengukuran Pressure","satuan":"mmHg"}],"TENSIMETER OTOMATIS":[{"pfa":"PKA1","nama":"Pengukuran Pressure","satuan":"mmHg"}],"Operating Lamp":[{"pfa":"PKA1","nama":"Pengukuran Intensitas Cahaya","satuan":"Lux"}],"EEG":[{"pfa":"PKA1","nama":"Pengukuran amplitudo","satuan":""}],"Cabinet Warmer":[{"pfa":"PKA1","nama":"Pengujian Suhu","satuan":""}],"ENT Treatment Unit":[{"pfa":"PKA1","nama":"Pengujian tekanan Vacuum","satuan":""}],"KIMIA ANALYZER":[{"pfa":"PKA1","nama":"Pengukuran QC UA","satuan":"mg/dL"},{"pfa":"PKA2","nama":"Pengukuran QC Glu","satuan":"mg/dL"},{"pfa":"PKA3","nama":"Pengukuran QC Tc","satuan":"mg/dL"},{"pfa":"PKA4","nama":"Pengukuran QC SGOT","satuan":"mg/dL"},{"pfa":"PKA5","nama":"Pengukuran QC SGPT","satuan":"mg/dL"}],"Anesthesi Ventilator":[],"TIMBANGAN - BAYI":[],"Kursi Gynecolog":[],"Suction Pump - high Vacuum":[{"pfa":"PKA1","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA2","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA3","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA4","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA5","nama":"Pengukuran Pressure","satuan":"mmHg"}],"Suction Pump - Low Vacuum":[{"pfa":"PKA1","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA2","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA3","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA4","nama":"Pengukuran Pressure","satuan":"mmHg"},{"pfa":"PKA5","nama":"Pengukuran Pressure","satuan":"mmHg"}],"TIMBANGAN - DEWASA":[],"OXYGEN CONCENTRATOR":[],"USG - General":[],"DEFIBRILATOR":[{"pfa":"PKA1","nama":"Pengukuran Joule","satuan":"J"},{"pfa":"PKA2","nama":"Pengukuran Joule","satuan":"J"},{"pfa":"PKA3","nama":"Pengukuran Joule","satuan":"J"},{"pfa":"PKA4","nama":"Pengukuran Joule","satuan":"J"},{"pfa":"PKA5","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA6","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA7","nama":"Pengukuran NIBP","satuan":"mmHg"},{"pfa":"PKA8","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA9","nama":"Pengukuran SPO2","satuan":"%"},{"pfa":"PKA10","nama":"Pengukuran SPO2","satuan":"%"}],"USG - OBGYN":[],"Fetal Doppler":[{"pfa":"PKA1","nama":"Pengukuran Fetal Heart Rate","satuan":"Bpm"},{"pfa":"PKA2","nama":"Pengukuran Fetal Heart Rate","satuan":"Bpm"},{"pfa":"PKA3","nama":"Pengukuran Fetal Heart Rate","satuan":"Bpm"},{"pfa":"PKA4","nama":"Pengukuran Fetal Heart Rate","satuan":"Bpm"}],"Hematology analyzer":[],"Nebulizer Compressor":[],"Infusion Warmer":[{"pfa":"PKA1","nama":"Pengukuran Suhu","satuan":"°C"},{"pfa":"PKA2","nama":"Pengukuran Suhu","satuan":"°C"},{"pfa":"PKA3","nama":"Pengukuran Suhu","satuan":"°C"}],"URINE ANALYZER":[],"Pulse Oxymeter":[{"pfa":"PKA1","nama":"Pengukuran SpO2","satuan":"%"},{"pfa":"PKA2","nama":"Pengukuran SpO2","satuan":"%"},{"pfa":"PKA3","nama":"Pengukuran SpO2","satuan":"%"},{"pfa":"PKA4","nama":"Pengukuran SpO2","satuan":"%"},{"pfa":"PKA5","nama":"Pengukuran SpO2","satuan":"%"},{"pfa":"PKA6","nama":"Pengukuran SpO2","satuan":"%"}],"High Flow Nasal Canula":[{"pfa":"PKA1","nama":"Pengukuran Flow O2","satuan":"Lpm"},{"pfa":"PKA2","nama":"Pengukuran Flow O2","satuan":"Lpm"},{"pfa":"PKA3","nama":"Pengukuran Flow O2","satuan":"Lpm"}],"Bio Safety Cabinet":[],"Ventilator Adult / Pediatrik":[],"Treadmill":[],"SCRUB STATION":[],"Timbangan Bayi":[],"Ventilator Transport Adult / Pediatrik":[{"pfa":"PKA1","nama":"Konsentrasi O2","satuan":"%"},{"pfa":"PKA2","nama":"Tidal Volume","satuan":"m/L"},{"pfa":"PKA3","nama":"Tekanan","satuan":"cmH2O"},{"pfa":"PKA4","nama":"Frekuensi/Rate","satuan":""},{"pfa":"PKA5","nama":"Waktu Inspirasi","satuan":"detik"},{"pfa":"PKA6","nama":"PEEP","satuan":"cmH2O"}],"Ventilator Bayi":[{"pfa":"PKA1","nama":"Konsentrasi O2","satuan":"%"},{"pfa":"PKA2","nama":"Tidal Volume","satuan":"m/L"},{"pfa":"PKA3","nama":"Tekanan","satuan":"cmH2O"},{"pfa":"PKA4","nama":"Frekuensi/Rate","satuan":""},{"pfa":"PKA5","nama":"Waktu Inspirasi","satuan":"detik"},{"pfa":"PKA6","nama":"PEEP","satuan":"cmH2O"}],"Automatic Resuscitator":[],"Baby CPAP":[{"pfa":"PKA1","nama":"Konsentrasi O2","satuan":"%"},{"pfa":"PKA2","nama":"Flow","satuan":"Lpm"}],"Diode Laser":[],"X-ray Dental Unit":[],"Electro Stimulator":[{"pfa":"PKA1","nama":"Frekuensi","satuan":"Hz"},{"pfa":"PKA2","nama":"Intensitas Theraphy","satuan":"mA"},{"pfa":"PKA3","nama":"Waktu Theraphy","satuan":"detik"}],"NPWT":[],"Endoscopy - Bronchoscopy":[],"Infra Red Therapy":[],"Sterilizer - Steam":[],"Bed Elektrik":[],"Timbangan Dewasa":[],"Vein Finder":[],"X-ray Film Viewer":[],"X-Ray Stationery":[],"Auto Washer Desinfektor":[],"Kursi Roda":[]};
        const MEDIX_PFA_UNITS = {"pengukuran nibp":"mmHg","pengukuran suhu":"°C","pengukuran spo2":"%","pengukuran heartrate":"Bpm","pengukuran fetal heartrate":"Bpm","pengukuran fetal heart rate":"Bpm","pengukuran intensitas cahaya":"Lux","pengukuran kebocoran radiasi":"mSv","pengukuran pressure":"mmHg","pengukuran kecepatan kertas":"m/s","pengukuran sensitivitas":"mV/mm","pengukuran qc ua":"mg/dL","pengukuran qc glu":"mg/dL","pengukuran qc tc":"mg/dL","pengukuran qc sgot":"mg/dL","pengukuran qc sgpt":"mg/dL","pengukuran flow o2":"Lpm","pengukuran energi":"Joule","konsentrasi o2":"%","tidal volume":"m/L","tekanan":"cmH2O","frekuensi/rate":"","waktu inspirasi":"detik","peep":"cmH2O","flow":"Lpm","frekuensi":"Hz","intensitas theraphy":"mA","waktu theraphy":"detik","pengukuran joule":"J","pengukuran flow rate":"ml/h","pengukuran occlusion":"PSI"};
        let pemeriksaanKinerjaLK = [];

        function medixNormText(v){
            return String(v||'').toLowerCase().replace(/[^a-z0-9%°/]+/g,' ').replace(/\s+/g,' ').trim();
        }
        function medixGetPfaTemplateForAsset(nama){
            const target=medixNormText(nama); if(!target) return [];
            let key=Object.keys(MEDIX_PFA_TEMPLATES).find(k=>medixNormText(k)===target);
            if(!key) key=Object.keys(MEDIX_PFA_TEMPLATES).find(k=>{const n=medixNormText(k);return target.includes(n)||n.includes(target);});
            if(!key) return [];
            return (MEDIX_PFA_TEMPLATES[key]||[]).map(x=>({
                ...x,
                satuan: String(x.satuan||'').trim() || MEDIX_PFA_UNITS[medixNormText(x.nama)] || ''
            }));
        }
        function medixEscPfa(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
        function renderPemeriksaanKinerjaLK(){
            const body=document.getElementById('dlk-pfa-body'),sub=document.getElementById('dlk-pfa-subtitle'); if(!body) return;
            const rows=Array.isArray(pemeriksaanKinerjaLK)?pemeriksaanKinerjaLK:[ ];
            if(sub) sub.textContent='';
            if(!rows.length){
                body.innerHTML='<tr><td colspan="8" class="lk-pfa-empty">Belum ada baris pemeriksaan. Gunakan <b>Tambah Baris</b> untuk input manual.</td></tr>';
                return;
            }
            body.innerHTML=rows.map((r,i)=>`<tr>
                <td><input type="text" value="${medixEscPfa(r.nama||'')}" placeholder="Pemeriksaan kinerja alat" data-pfa-index="${i}" data-pfa-field="nama"></td>
                <td><input type="text" value="${medixEscPfa(r.satuan||'')}" placeholder="Satuan" data-pfa-index="${i}" data-pfa-field="satuan"></td>
                <td><input type="text" value="${medixEscPfa(r.setting||'')}" data-pfa-index="${i}" data-pfa-field="setting"></td>
                <td><input type="text" value="${medixEscPfa(r.t1||'')}" data-pfa-index="${i}" data-pfa-field="t1"></td>
                <td><input type="text" value="${medixEscPfa(r.t2||'')}" data-pfa-index="${i}" data-pfa-field="t2"></td>
                <td><input type="text" value="${medixEscPfa(r.t3||'')}" data-pfa-index="${i}" data-pfa-field="t3"></td>
                <td><input type="text" value="${medixEscPfa(r.acuan||'')}" data-pfa-index="${i}" data-pfa-field="acuan"></td>
                <td class="pfa-center"><label title="Baik"><input type="radio" name="pfa-status-${i}" value="Baik" ${r.status==='Baik'?'checked':''} data-pfa-index="${i}" data-pfa-field="status"> B</label><label title="Tidak"><input type="radio" name="pfa-status-${i}" value="Tidak" ${r.status==='Tidak'?'checked':''} data-pfa-index="${i}" data-pfa-field="status"> T</label></td>
            </tr>`).join('');
            body.querySelectorAll('[data-pfa-index][data-pfa-field]').forEach(el=>{
                const handler=()=>{const i=Number(el.dataset.pfaIndex),field=el.dataset.pfaField;if(!pemeriksaanKinerjaLK[i])return;pemeriksaanKinerjaLK[i][field]=el.type==='radio'?(el.checked?el.value:pemeriksaanKinerjaLK[i][field]):el.value;};
                el.addEventListener('input',handler);el.addEventListener('change',handler);
            });
        }
        function tambahBarisPemeriksaanKinerjaLK(){
            if(!Array.isArray(pemeriksaanKinerjaLK)) pemeriksaanKinerjaLK=[];
            pemeriksaanKinerjaLK.push({pfa:'',nama:'',satuan:'',setting:'',t1:'',t2:'',t3:'',acuan:'',status:''});
            renderPemeriksaanKinerjaLK();
            requestAnimationFrame(()=>{
                const body=document.getElementById('dlk-pfa-body');
                const last=body?.querySelector('tr:last-child input[data-pfa-field="nama"]');
                last?.focus();
            });
        }
        function setPemeriksaanKinerjaUntukAlat(nama,forceTemplate=false){
            const template=medixGetPfaTemplateForAsset(nama);
            if(!forceTemplate&&Array.isArray(pemeriksaanKinerjaLK)&&pemeriksaanKinerjaLK.length){renderPemeriksaanKinerjaLK();return;}
            pemeriksaanKinerjaLK=template.length
                ? template.map(x=>({...x,setting:'',t1:'',t2:'',t3:'',acuan:'',status:''}))
                : [{pfa:'',nama:'',satuan:'',setting:'',t1:'',t2:'',t3:'',acuan:'',status:''}];
            renderPemeriksaanKinerjaLK();
        }
        function parseUraianLamaKeStruktur(desc){
            const raw=String(desc||'').trim(),out={keluhan:'',penyebab:'',pengecekan:'',solusi:''}; if(!raw)return out;
            const labels=[['keluhan','Keluhan'],['penyebab','Penyebab'],['pengecekan','Pengecekan'],['solusi','Solusi']]; let found=false;
            labels.forEach(([key,label],idx)=>{
                const next=idx<labels.length-1?labels[idx+1][1]:null;
                const re=next?new RegExp('(?:^|\\n)\\s*'+label+'\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*'+next+'\\s*:?)','i'):new RegExp('(?:^|\\n)\\s*'+label+'\\s*:?\\s*([\\s\\S]*)','i');
                const m=raw.match(re);if(m){out[key]=m[1].trim();found=true;}
            });
            if(!found)out.pengecekan=raw; return out;
        }
        function medixGetStructuredUraian(){
            const get=id=>document.getElementById(id)?.value?.trim()||'';
            return {keluhan:get('dlk-uraian-keluhan'),penyebab:get('dlk-uraian-penyebab'),pengecekan:get('dlk-uraian-pengecekan'),solusi:get('dlk-uraian-solusi')};
        }
        function medixBuildDescKerja(){
            const d=medixGetStructuredUraian();
            return ['Keluhan: '+d.keluhan,'Penyebab: '+d.penyebab,'Pengecekan: '+d.pengecekan,'Solusi: '+d.solusi].join('\n');
        }
        function medixLoadStructuredUraian(record){
            const p=(record?.keluhan!==undefined||record?.penyebab!==undefined||record?.pengecekan!==undefined||record?.solusi!==undefined)?{keluhan:record.keluhan||'',penyebab:record.penyebab||'',pengecekan:record.pengecekan||'',solusi:record.solusi||''}:parseUraianLamaKeStruktur(record?.desc_kerja||'');
            [['dlk-uraian-keluhan',p.keluhan],['dlk-uraian-penyebab',p.penyebab],['dlk-uraian-pengecekan',p.pengecekan],['dlk-uraian-solusi',p.solusi]].forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.value=val||'';});
        }
        function resetPemeriksaanKinerjaLK(){pemeriksaanKinerjaLK=[{pfa:'',nama:'',satuan:'',setting:'',t1:'',t2:'',t3:'',acuan:'',status:''}];renderPemeriksaanKinerjaLK();}

        function sinkronisasiDataAlatKeWorksheet(id) {
            const a = dataAlat.find(item => item.id == id);
            if(a) {
                document.getElementById('dlk-selected-alat-id').value = a.id;
                let dMerk = a.merk || '-', dTipe = a.tipe || '-', dSeri = a.seri || '-', dLokasi = a.ruangan || a.lokasi || '-';
                document.getElementById('dlk-nama').value = a.nama; 
                document.getElementById('dlk-merk').value = dMerk; 
                document.getElementById('dlk-tipe').value = dTipe; 
                document.getElementById('dlk-seri').value = dSeri; 
                document.getElementById('dlk-lokasi').value = dLokasi;

                // Otomatis isi kepala ruangan/petugas berdasarkan lokasi alat.
                sinkronisasiKepalaRuanganWorksheet(dLokasi);
                inisialisasiInputKepalaRuanganWorksheet();
                setPenanggungJawabAlkesOtomatis();

                // Otomatis isi alat kerja, pemeriksaan fisik, fungsi, dan PFA berdasarkan nama alat.
                terapkanTemplateLKUntukAlat(a.nama, true);
                setPemeriksaanKinerjaUntukAlat(a.nama, true);
                
                const inputSearch = document.getElementById('input-search-alat-worksheet');
                if(inputSearch) inputSearch.value = a.nama + " (" + (a.seri || "-") + ")";

                const listCal = dataKalibrasi.filter(c => c.alatId === id);
                if(listCal.length > 0) {
                    listCal.sort((x, y) => String(y.exp).localeCompare(String(x.exp)));
                    document.getElementById('dlk-tglcal').value = listCal[0].tgl || "";
                    document.getElementById('dlk-nokal').value = listCal[0].exp || "";
                } else {
                    document.getElementById('dlk-tglcal').value = "";
                    document.getElementById('dlk-nokal').value = "";
                }
                populasikanDropdownNamaTandaTangan();
                const selTeknisi = document.getElementById('dlk-select-nama-teknisi');
                if(selTeknisi && selTeknisi.innerHTML.includes(currentUserNama)) { selTeknisi.value = currentUserNama; }
            }
        }

        function hitungOtomatisMasaBerlakuSatuTahun(v) { if(!v) return; let d = new Date(v); d.setFullYear(d.getFullYear()+1); document.getElementById('dlk-nokal').value = d.toISOString().substring(0,10); }
        
        function populasikanDropdownNamaTandaTangan() {
            const selTek = document.getElementById('dlk-select-nama-teknisi');
            if(selTek) {
                const teknisiLk = [
                    'Arrief Nurcahyo, S.Tr.Em.',
                    'Nabilah Azhar Ardiyana, S.Tr.TEM.',
                    'Baits Abdul Pattah, A.Md.T'
                ];
                const nilaiLama = selTek.value;
                selTek.innerHTML = `<option value="">-- PILIH TEKNISI --</option>` +
                    teknisiLk.map(n => `<option value="${n}">${n}</option>`).join('');
                if (nilaiLama && teknisiLk.includes(nilaiLama)) selTek.value = nilaiLama;
            }
            const inputKepala = document.getElementById('dlk-kepala-ruangan-nama');
            const hiddenKepala = document.getElementById('dlk-select-nama-saksi');
            if(inputKepala && hiddenKepala) hiddenKepala.value = inputKepala.value || '';
            setPenanggungJawabAlkesOtomatis();
        }

        let medixInputResolver = null;
        let medixInputKeyHandler = null;

        function showMedixInputDialog(message, options = {}) {
            return new Promise(resolve => {
                const modal = document.getElementById('medix-input-dialog');
                const field = document.getElementById('medix-input-field');
                const messageEl = document.getElementById('medix-input-message');
                const titleEl = document.getElementById('medix-input-title');
                const okBtn = document.getElementById('medix-input-ok');
                const cancelBtn = document.getElementById('medix-input-cancel');
                if (!modal || !field || !messageEl || !titleEl || !okBtn || !cancelBtn) {
                    showToast('Komponen input MEDIX tidak tersedia.', 'error');
                    resolve(null);
                    return;
                }
                if (typeof medixInputResolver === 'function') medixInputResolver(null);
                let settled = false;
                const finish = value => {
                    if (settled) return;
                    settled = true;
                    if (medixInputKeyHandler) { document.removeEventListener('keydown', medixInputKeyHandler); medixInputKeyHandler = null; }
                    if (medixInputResolver === finish) medixInputResolver = null;
                    modal.classList.add('hidden');
                    document.body.classList.remove('overflow-hidden');
                    resolve(value);
                };
                medixInputResolver = finish;
                titleEl.textContent = options.title || 'Masukkan Data';
                messageEl.textContent = String(message || 'Silakan masukkan data.');
                okBtn.textContent = options.okText || 'Simpan';
                cancelBtn.textContent = options.cancelText || 'Batal';
                field.value = options.value || '';
                field.placeholder = options.placeholder || '';
                okBtn.onclick = () => finish(field.value.trim());
                cancelBtn.onclick = () => finish(null);
                modal.onclick = e => { if (e.target === modal) finish(null); };
                medixInputKeyHandler = e => {
                    if (e.key === 'Escape') finish(null);
                    else if (e.key === 'Enter') { e.preventDefault(); finish(field.value.trim()); }
                };
                document.addEventListener('keydown', medixInputKeyHandler);
                modal.classList.remove('hidden');
                document.body.classList.add('overflow-hidden');
                setTimeout(() => { field.focus(); field.select(); }, 30);
            });
        }

        async function handleDropdownNamaBaru(selectEl, jenisRole) {
            const val = selectEl.value;
            if(val === 'tambah-teknisi-baru' || val === 'tambah-user-baru') {
                const targetRoleName = (jenisRole === 'Teknisi') ? 'Teknisi' : 'User';
                const namaBaru = await showMedixInputDialog(`Masukkan Nama Lengkap ${targetRoleName} Baru:`, {
                    title: `Tambah Nama ${targetRoleName}`,
                    okText: 'Gunakan Nama',
                    placeholder: `Nama lengkap ${targetRoleName}`
                });
                if(namaBaru) {
                    showToast(`Untuk membuat akun login ${targetRoleName}, gunakan menu Kelola Akun agar email/password Firebase dibuat dengan aman.`, 'info');
                }
                selectEl.selectedIndex = 0;
            }
        }
        
        function renderTabelPusatDokumen() {
            const tBody = document.getElementById('table-kalibrasi-body'); if(!tBody) return; 
            let docs = [];
            
            dataKalibrasi.forEach(c => { 
                const a = dataAlat.find(i => i.id == c.alatId) || { nama: 'Alat Medis', tipe: '-' }; 
                docs.push({ id: c.id, namaAlat: a.nama, seri: a.seri || a.tipe || '-', jenis: 'Sertifikat Kalibrasi Resmi', tgl: c.tgl, desc: c.vendor, file: c.certPdf, type: 'pdf', hasil: c.hasil, koleksiDb: 'dataKalibrasi' }); 
            });
            
            const combinedLk = [...dataPerbaikan, ...dataPM, ...dataInspeksi];
            combinedLk.forEach(lk => { 
                const a = dataAlat.find(i => i.id == lk.alatId) || { nama: 'Alat Medis', tipe: '-' }; 
                docs.push({
                    id: lk.id, namaAlat: a.nama, seri: a.seri || a.tipe || '-', jenis: lk.jenisKerja, lkNo: lk.noLk,
                    tgl: lk.textTgl || (lk.tgl ? lk.tgl.substring(0,16) : '-'),
                    desc: `No LK: ${lk.noLk} | Teknisi: ${lk.teknisiTtd || '-'}`,
                    file: lk.fileData || lk.id, fileType: lk.fileType || 'application/pdf',
                    type: lk.fileData ? 'sop-preview' : 'lk-print', hasil: lk.hasilTunggal || 'Baik', koleksiDb: 'lembarKerja'
                }); 
            });
            
            dataKeluhanLog.forEach(lg => {
                const sudahAdaLk = combinedLk.some(lk => lk.alatId === lg.alatId);
                if (!sudahAdaLk) {
                    const a = dataAlat.find(i => i.id == lg.alatId) || { nama: 'Alat Medis', tipe: '-' }; 
                    docs.push({ id: lg.id, namaAlat: a.nama, seri: a.seri || a.tipe || '-', jenis: 'Laporan Kerusakan', tgl: lg.textTgl, desc: lg.desc_kerja, file: '#', type: 'log-only', hasil: lg.hasilTunggal || 'Menunggu', koleksiDb: 'laporanKeluhanLog' });
                }
            });
        
            dataBukuPetunjuk.forEach(b => {
                const a = dataAlat.find(i => i.id == b.alatId) || { nama: 'Alat Medis', tipe: '-' };
                docs.push({ id: b.id, namaAlat: a.nama, seri: a.seri || a.tipe || '-', jenis: 'SOP / Buku Petunjuk', tgl: b.tglUpload || '-', desc: b.namaFile, file: b.fileData, type: 'sop-preview', fileType: b.fileType, hasil: 'Tersedia', koleksiDb: 'bukuPetunjukAlat' });
            });
        
            if(subTabDokumenAktif === 'kalibrasi') docs = docs.filter(d => d.jenis === 'Sertifikat Kalibrasi Resmi');
            if(subTabDokumenAktif === 'mandiri') docs = docs.filter(d => d.jenis !== 'Sertifikat Kalibrasi Resmi' && d.jenis !== 'Sertifikat Kalibrasi' && d.jenis !== 'SOP / Buku Petunjuk');
            if(subTabDokumenAktif === 'sop') docs = docs.filter(d => d.jenis === 'SOP / Buku Petunjuk');
        
            docs.sort((x,y) => String(y.tgl).localeCompare(String(x.tgl)));
            
            if(docs.length === 0) { tBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 italic">Tidak ada berkas dokumen pada kategori ini.</td></tr>`; return; }
            
            tBody.innerHTML = docs.map(d => {
                let tombolAksiHapus = "";
                if (izinMenu('riwayat', 'hapus')) {
                    if (d.jenis === 'SOP / Buku Petunjuk') {
                        tombolAksiHapus = `<button onclick="hapusBukuPetunjuk('${d.id}')" class="bg-rose-50 text-rose-600 p-1.5 rounded-r-lg hover:bg-rose-100 transition border-l border-slate-200" title="Hapus Berkas"><i class="fa-solid fa-trash"></i></button>`;
                    } else {
                        tombolAksiHapus = `<button onclick="hapusDokumenPusatRiwayat('${d.id}', '${d.koleksiDb}')" class="bg-rose-50 text-rose-600 p-1.5 rounded-r-lg hover:bg-rose-100 transition border-l border-slate-200" title="Hapus Berkas"><i class="fa-solid fa-trash"></i></button>`;
                    }
                } else { tombolAksiHapus = `<span class="p-1.5 text-slate-400"><i class="fa-solid fa-lock text-[10px]"></i></span>`; }
        
                let tombolLihat = "";
                if(d.type === 'pdf') {
                    tombolLihat = `<button onclick="bukaDokumenPusat('${d.id}','${d.koleksiDb}','pdf','Sertifikat')" class="bg-blue-50 text-blue-600 p-1.5 rounded-l-lg hover:bg-blue-100 transition" title="Lihat Dokumen"><i class="fa-solid fa-eye"></i></button>`;
                } else if(d.type === 'lk-print') {
                    tombolLihat = `<button onclick="bukaLembarKerjaDinamisDarlLog('${d.file}')" class="bg-blue-50 text-blue-600 p-1.5 rounded-l-lg hover:bg-blue-100 transition" title="Lihat LK"><i class="fa-solid fa-eye"></i></button>`;
                } else if(d.type === 'sop-preview') {
                    tombolLihat = `<button onclick="bukaDokumenPusat('${d.id}','${d.koleksiDb}','${d.fileType || 'application/pdf'}','${String(d.desc || '').replace(/'/g, '\&#39;')}')" class="bg-blue-50 text-blue-600 p-1.5 rounded-l-lg hover:bg-blue-100 transition" title="Preview SOP"><i class="fa-solid fa-book-open"></i></button>`;
                } else { tombolLihat = `<span class="text-[10px] text-slate-400 italic px-2">Log</span>`; }
        
                let formatTglDokumen = d.tgl ? String(d.tgl).replace('T', ' ') : '-';
        
                return `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 text-slate-700">
                        <td class="p-4"><b>${d.namaAlat}</b><br><span class="text-[10px] text-slate-500 font-mono">SN: ${d.seri}</span></td>
                        <td class="p-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${d.jenis.includes('Kalibrasi')?'bg-amber-50 text-amber-700 border border-amber-200':d.jenis.includes('SOP')?'bg-cyan-50 text-cyan-700 border border-cyan-200':d.jenis.includes('Laporan')?'bg-rose-50 text-rose-700 border border-rose-200':'bg-indigo-50 text-indigo-700 border border-indigo-200'}">${d.jenis}</span></td>
                        <td class="p-4 font-mono text-[11px]">${formatTglDokumen}</td>
                        <td class="p-4 text-slate-600 max-w-xs truncate">${d.desc}</td>
                        <td class="p-4 text-center"><div class="inline-flex rounded-lg shadow-sm border border-slate-200">${tombolLihat}${tombolAksiHapus}</div></td>
                        <td class="p-4"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${d.hasil.includes('Baik')||d.hasil==='Laik'||d.hasil==='Tersedia'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-rose-50 text-rose-700 border border-rose-200'}">${d.hasil}</span></td>
                    </tr>
                `;
            }).join('');
        }


        // ================================================================
        // MONITORING BHP & AKSESORIS — terintegrasi dengan Lembar Kerja (LK)
        // Master item sengaja manual karena satu jenis alat dapat memakai
        // BHP yang sama atau berbeda. Stok dihitung dari transaksi IN/OUT.
        // ================================================================
        let dataBHPItems = [];
        let dataBHPTransactions = [];
        let bhpUsageLK = [];

        function escBHP(v) {
            return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
        }
        function angkaBHP(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
        function getStokBHP(itemId) {
            const item = dataBHPItems.find(x => String(x.id) === String(itemId));
            if (!item) return { awal:0, masuk:0, keluar:0, stok:0 };
            let masuk=0, keluar=0;
            dataBHPTransactions.filter(t => String(t.itemId) === String(itemId)).forEach(t => {
                const q=angkaBHP(t.qty); if (String(t.tipe).toUpperCase()==='IN') masuk += q; else if (String(t.tipe).toUpperCase()==='OUT') keluar += q;
            });
            return { awal:angkaBHP(item.stokAwal), masuk, keluar, stok:angkaBHP(item.stokAwal)+masuk-keluar };
        }
        function statusStokBHP(item) {
            const s=getStokBHP(item.id).stok, min=angkaBHP(item.stokMinimum);
            if (s <= 0) return 'habis';
            if (min > 0 && s <= min) return 'menipis';
            return 'aman';
        }
        function hitungRingkasanBHP() {
            const r={total:dataBHPItems.length, aman:0, menipis:0, habis:0};
            dataBHPItems.forEach(i => r[statusStokBHP(i)]++); return r;
        }
        function badgeStatusBHP(status) {
            const m={aman:['Aman','bg-emerald-50 text-emerald-700 border-emerald-200'],menipis:['Menipis','bg-amber-50 text-amber-700 border-amber-200'],habis:['Habis','bg-rose-50 text-rose-700 border-rose-200']};
            const x=m[status]||m.aman; return `<span class="px-2 py-1 rounded-full border text-[9px] font-black ${x[1]}">${x[0]}</span>`;
        }
        function resetFilterBHP(){
            ['bhp-filter-search','bhp-filter-jenis','bhp-filter-status','bhp-filter-alkes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
            renderBHPTable();
        }

        function renderBHPTable() {
            const body=document.getElementById('table-bhp-body'); if(!body) return;
            const q=(document.getElementById('bhp-filter-search')?.value||'').toLowerCase().trim();
            const jenis=document.getElementById('bhp-filter-jenis')?.value||'';
            const status=document.getElementById('bhp-filter-status')?.value||'';
            const alkes=document.getElementById('bhp-filter-alkes')?.value||'';
            const sel=document.getElementById('bhp-filter-alkes');
            if(sel){ const old=sel.value; const names=[...new Set(dataBHPItems.map(x=>x.namaAlkes).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'id')); sel.innerHTML='<option value="">Semua Alkes</option>'+names.map(x=>`<option value="${escBHP(x)}">${escBHP(x)}</option>`).join(''); if(names.includes(old)) sel.value=old; }
            const rows=dataBHPItems.filter(i=>{
                const hay=[i.namaAlkes,i.namaItem,i.jenisItem,i.spesifikasi].join(' ').toLowerCase();
                return (!q||hay.includes(q))&&(!jenis||i.jenisItem===jenis)&&(!status||statusStokBHP(i)===status)&&(!alkes||i.namaAlkes===alkes);
            });
            const count=document.getElementById('bhp-filter-count'); if(count) count.textContent=`${rows.length} item${rows.length===1?'':'s'}`;
            body.innerHTML=rows.length?rows.map(i=>{const st=getStokBHP(i.id), ss=statusStokBHP(i); return `<tr class="hover:bg-slate-50"><td class="p-3 font-semibold">${escBHP(i.namaAlkes||'-')}</td><td class="p-3 font-bold text-slate-900">${escBHP(i.namaItem||'-')}</td><td class="p-3">${escBHP(i.jenisItem||'-')}</td><td class="p-3">${escBHP(i.spesifikasi||'-')}</td><td class="p-3">${escBHP(i.satuan||'-')}</td><td class="p-3 text-center">${st.awal}</td><td class="p-3 text-center text-blue-700 font-bold">${st.masuk}</td><td class="p-3 text-center text-amber-700 font-bold">${st.keluar}</td><td class="p-3 text-center text-lg font-black ${st.stok<=0?'text-rose-700':'text-slate-900'}">${st.stok}</td><td class="p-3 text-center">${badgeStatusBHP(ss)}</td><td class="p-3 text-center"><div class="inline-flex rounded-lg overflow-hidden border border-slate-200">${izinMenu('bhp','edit')?`<button onclick="bukaModalBHP('${i.id}')" class="px-2.5 py-2 bg-amber-50 text-amber-700" title="Edit"><i class="fa-solid fa-pen"></i></button><button onclick="bukaModalTransaksiBHP('IN','${i.id}')" class="px-2.5 py-2 bg-blue-50 text-blue-700" title="Stok masuk"><i class="fa-solid fa-arrow-down"></i></button><button onclick="bukaModalTransaksiBHP('OUT','${i.id}')" class="px-2.5 py-2 bg-emerald-50 text-emerald-700" title="Stok keluar"><i class="fa-solid fa-arrow-up"></i></button>`:'-'}</div></td></tr>`;}).join(''):`<tr><td colspan="11" class="p-8 text-center text-slate-400 italic">Belum ada item BHP / Aksesoris. Tambahkan secara manual.</td></tr>`;
        }
        function inisialisasiFilterRekapanBHP(){
            const yearSel=document.getElementById('bhp-rekap-tahun');
            const monthSel=document.getElementById('bhp-rekap-bulan');
            if(monthSel && !monthSel.options.length){
                const bulan=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
                monthSel.innerHTML=bulan.map((b,i)=>`<option value="${i}">${b}</option>`).join('');
                monthSel.value=String(new Date().getMonth());
            }
            if(yearSel){
                const years=new Set([new Date().getFullYear()]);
                (Array.isArray(dataBHPTransactions)?dataBHPTransactions:[]).forEach(t=>{
                    const d=String(t.tanggal||t.tanggalLk||'');
                    const m=d.match(/(20\d{2})/);
                    if(m) years.add(Number(m[1]));
                });
                const old=yearSel.value;
                yearSel.innerHTML=Array.from(years).sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join('');
                yearSel.value=years.has(Number(old))?old:String(new Date().getFullYear());
            }
        }

        function renderBHPRecapLK(){
            inisialisasiFilterRekapanBHP();
            const body=document.getElementById('table-bhp-rekap-lk-body');
            if(!body)return;
            const q=(document.getElementById('bhp-rekap-lk-search')?.value||'').toLowerCase().trim();
            const rows=dataBHPTransactions.filter(t=>String(t.sumber||'').toUpperCase()==='LK').map(t=>{
                const item=dataBHPItems.find(i=>String(i.id)===String(t.itemId))||{};
                return {t,item};
            }).filter(({t,item})=>{
                const hay=[t.noLk,t.alatId,t.keterangan,t.createdByNama,item.namaItem,item.namaAlkes,item.jenisItem].join(' ').toLowerCase();
                return !q||hay.includes(q);
            }).sort((a,b)=>String(b.t.tanggal||'').localeCompare(String(a.t.tanggal||'')));
            const count=document.getElementById('bhp-rekap-lk-count');
            if(count)count.textContent=`${rows.length} transaksi`;
            if(!rows.length){
                body.innerHTML='<tr><td colspan="7" class="p-8 text-center text-slate-400 italic">Belum ada pemakaian BHP yang berasal dari LK.</td></tr>';
                return;
            }
            body.innerHTML=rows.slice(0,200).map(({t,item})=>{
                const alat=dataAlat.find(a=>String(a.id)===String(t.alatId))||{};
                const canOpen=!!t.lkId && (dataLembarKerja||[]).some(l=>String(l.id)===String(t.lkId));
                return `<tr class="hover:bg-emerald-50/50"><td class="p-3 font-mono text-[10px]">${escBHP(t.tanggal||t.tanggalLk||'-')}</td><td class="p-3 font-mono font-bold text-indigo-700">${escBHP(t.noLk||'-')}</td><td class="p-3">${escBHP(alat.nama||t.alatId||'-')}<br><span class="text-[9px] text-slate-400">SN ${escBHP(alat.seri||'-')}</span></td><td class="p-3 font-bold">${escBHP(item.namaItem||'-')}<br><span class="text-[9px] text-slate-500">${escBHP(item.namaAlkes||'-')}</span></td><td class="p-3 text-center font-black">${angkaBHP(t.qty)} ${escBHP(item.satuan||'')}</td><td class="p-3">${escBHP(t.createdByNama||'-')}</td><td class="p-3 text-center">${canOpen?`<button type="button" onclick="bukaLembarKerjaDinamisDarlLog('${String(t.lkId).replace(/'/g,'&#39;')}')" class="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-[9px]">Lihat LK</button>`:'-'}</td></tr>`;
            }).join('');
            if(rows.length>200){
                body.insertAdjacentHTML('beforeend','<tr><td colspan="7" class="p-2 text-center text-[9px] text-slate-400">Menampilkan 200 transaksi terbaru. Gunakan pencarian untuk mempersempit hasil.</td></tr>');
            }
        }

        function exportRekapanBHP(mode='year'){
            if(typeof XLSX==='undefined'){showToast('Library Excel belum tersedia.','error');return;}
            const year=Number(document.getElementById('bhp-rekap-tahun')?.value)||new Date().getFullYear();
            const month=Number(document.getElementById('bhp-rekap-bulan')?.value);
            const bulan=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
            const transaksi=(Array.isArray(dataBHPTransactions)?dataBHPTransactions:[]).filter(t=>String(t.sumber||'').toUpperCase()==='LK');
            const rows=transaksi.map(t=>{
                const d=String(t.tanggal||t.tanggalLk||'');
                const m=d.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})/);
                if(!m)return null;
                const y=Number(m[1]), mo=Number(m[2])-1;
                if(y!==year || (mode==='month' && mo!==month))return null;
                const item=dataBHPItems.find(i=>String(i.id)===String(t.itemId))||{};
                const alat=dataAlat.find(a=>String(a.id)===String(t.alatId))||{};
                return {
                    "Tanggal":d,
                    "No LK":t.noLk||'-',
                    "Alat Kesehatan":alat.nama||t.alatId||'-',
                    "SN":alat.seri||'-',
                    "BHP / Aksesoris":item.namaItem||t.namaItem||'-',
                    "Jenis":item.jenisItem||t.jenisItem||'-',
                    "Spesifikasi":item.spesifikasi||'-',
                    "Qty":angkaBHP(t.qty),
                    "Satuan":item.satuan||t.satuan||'-',
                    "Teknisi":t.createdByNama||'-',
                    "Sumber":t.sumber||'LK'
                };
            }).filter(Boolean).sort((a,b)=>String(a.Tanggal).localeCompare(String(b.Tanggal)));
            const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Informasi":`Tidak ada transaksi BHP dari LK untuk ${mode==='month'?bulan[month]+' ':''}${year}.`}]);
            ws['!cols']=[{wch:13},{wch:18},{wch:28},{wch:18},{wch:28},{wch:16},{wch:28},{wch:10},{wch:10},{wch:22},{wch:10}];
            const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Rekapan BHP LK');
            const suffix=mode==='month'?`${year}-${String(month+1).padStart(2,'0')}`:String(year);
            XLSX.writeFile(wb,`Rekapan_BHP_LK_${suffix}.xlsx`);
            showToast(`Rekapan BHP ${mode==='month'?bulan[month]+' ':''}${year} berhasil diunduh (${rows.length} transaksi).`,'success');
        }

        function bukaModalBHP(id='') {
            let m=document.getElementById('modal-bhp'); if(!m){
                m=document.createElement('div'); m.id='modal-bhp'; m.className='fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 no-print'; document.body.appendChild(m);
            }
            const item=dataBHPItems.find(x=>String(x.id)===String(id));
            m.innerHTML=`<form onsubmit="simpanMasterBHP(event)" class="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200"><div class="p-4 border-b font-black text-slate-800 flex justify-between"><span>${item?'Edit':'Tambah'} BHP / Aksesoris</span><button type="button" onclick="tutupModalBHP()" class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div><div class="p-5 grid grid-cols-2 gap-3 text-xs"><input type="hidden" id="bhp-form-id" value="${escBHP(item?.id||'')}"><div class="col-span-2"><label class="font-bold">Nama Alkes *</label><input required id="bhp-form-alkes" value="${escBHP(item?.namaAlkes||'')}" class="w-full border rounded-xl p-2.5 mt-1"></div><div class="col-span-2"><label class="font-bold">Nama Item *</label><input required id="bhp-form-item" value="${escBHP(item?.namaItem||'')}" class="w-full border rounded-xl p-2.5 mt-1"></div><div><label class="font-bold">Jenis *</label><select id="bhp-form-jenis" class="w-full border rounded-xl p-2.5 mt-1"><option ${item?.jenisItem==='AKSESORIS'?'selected':''}>AKSESORIS</option><option ${item?.jenisItem==='DISPOSABLE'?'selected':''}>DISPOSABLE</option><option ${item?.jenisItem==='SUKU CADANG'?'selected':''}>SUKU CADANG</option></select></div><div><label class="font-bold">Satuan *</label><input required id="bhp-form-satuan" value="${escBHP(item?.satuan||'PCS')}" class="w-full border rounded-xl p-2.5 mt-1"></div><div class="col-span-2"><label class="font-bold">Spesifikasi</label><input id="bhp-form-spesifikasi" value="${escBHP(item?.spesifikasi||'')}" class="w-full border rounded-xl p-2.5 mt-1"></div><div><label class="font-bold">Stok Awal</label><input type="number" step="0.01" id="bhp-form-stok-awal" value="${angkaBHP(item?.stokAwal)}" class="w-full border rounded-xl p-2.5 mt-1"></div><div><label class="font-bold">Minimum Stok</label><input type="number" min="0" step="0.01" id="bhp-form-min" value="${angkaBHP(item?.stokMinimum)}" class="w-full border rounded-xl p-2.5 mt-1"></div></div><div class="p-4 border-t bg-slate-50 flex justify-end gap-2"><button type="button" onclick="tutupModalBHP()" class="px-4 py-2 rounded-xl bg-slate-200">Batal</button><button class="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold">Simpan</button></div></form>`;
        }
        function tutupModalBHP(){document.getElementById('modal-bhp')?.remove();}
        async function simpanMasterBHP(e){e.preventDefault(); if(!izinMenu('bhp','edit')){showToast('Akses edit BHP tidak diberikan.','error');return;} const id=document.getElementById('bhp-form-id').value; const payload={namaAlkes:document.getElementById('bhp-form-alkes').value.trim(),namaItem:document.getElementById('bhp-form-item').value.trim(),jenisItem:document.getElementById('bhp-form-jenis').value,satuan:document.getElementById('bhp-form-satuan').value.trim(),spesifikasi:document.getElementById('bhp-form-spesifikasi').value.trim(),stokAwal:angkaBHP(document.getElementById('bhp-form-stok-awal').value),stokMinimum:angkaBHP(document.getElementById('bhp-form-min').value),updatedAt:firebase.firestore.FieldValue.serverTimestamp()}; try{if(id) await db.collection('bhpItems').doc(id).set(payload,{merge:true});else{payload.createdAt=firebase.firestore.FieldValue.serverTimestamp();await db.collection('bhpItems').add(payload);} tutupModalBHP();showToast('Master BHP berhasil disimpan.','success');}catch(err){console.error('Simpan master BHP gagal:',err); const msg=err?.code==='permission-denied' ? 'Firestore Rules menolak akses bhpItems. Tambahkan izin read/write untuk Admin/Teknisi pada collection bhpItems.' : ('Gagal menyimpan master BHP: '+(err.message||err)); showToast(msg,'error');}}
        function bukaModalTransaksiBHP(tipe='IN', itemId=''){
            let m=document.getElementById('modal-bhp-tx'); if(!m){m=document.createElement('div');m.id='modal-bhp-tx';m.className='fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 no-print';document.body.appendChild(m);}
            const opts=dataBHPItems.map(i=>`<option value="${escBHP(i.id)}" ${String(i.id)===String(itemId)?'selected':''}>${escBHP(i.namaAlkes)} — ${escBHP(i.namaItem)} (${escBHP(i.satuan)})</option>`).join('');
            m.innerHTML=`<form onsubmit="simpanTransaksiBHP(event)" class="bg-white w-full max-w-md rounded-2xl shadow-2xl"><div class="p-4 border-b font-black">${tipe==='IN'?'Stok Masuk':'Stok Keluar'}</div><div class="p-5 space-y-3 text-xs"><input type="hidden" id="bhp-tx-tipe" value="${tipe}"><label class="font-bold block">Item<select required id="bhp-tx-item" class="w-full border rounded-xl p-2.5 mt-1 bg-white"><option value="">-- Pilih Item --</option>${opts}</select></label><label class="font-bold block">Jumlah<input required min="0.01" step="0.01" type="number" id="bhp-tx-qty" value="1" class="w-full border rounded-xl p-2.5 mt-1"></label><label class="font-bold block">Tanggal<input required type="date" id="bhp-tx-tgl" value="${new Date().toISOString().slice(0,10)}" class="w-full border rounded-xl p-2.5 mt-1"></label><label class="font-bold block">Keterangan<input id="bhp-tx-ket" placeholder="Contoh: pembelian / pemakaian umum" class="w-full border rounded-xl p-2.5 mt-1"></label></div><div class="p-4 border-t bg-slate-50 flex justify-end gap-2"><button type="button" onclick="document.getElementById('modal-bhp-tx').remove()" class="px-4 py-2 rounded-xl bg-slate-200">Batal</button><button class="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold">Simpan</button></div></form>`;
        }
        async function simpanTransaksiBHP(e){e.preventDefault(); if(!izinMenu('bhp','edit')){showToast('Akses transaksi BHP tidak diberikan.','error');return;} const tipe=document.getElementById('bhp-tx-tipe').value,itemId=document.getElementById('bhp-tx-item').value,qty=angkaBHP(document.getElementById('bhp-tx-qty').value); if(!itemId||qty<=0)return; const ref=db.collection('bhpTransactions').doc(); try{await ref.set({itemId,tipe,qty,tanggal:document.getElementById('bhp-tx-tgl').value,keterangan:document.getElementById('bhp-tx-ket').value.trim(),sumber:'Manual',createdByUid:auth.currentUser?.uid||'',createdByNama:currentUserNama||'',createdAt:firebase.firestore.FieldValue.serverTimestamp()});document.getElementById('modal-bhp-tx')?.remove();showToast('Transaksi stok berhasil disimpan.','success');}catch(err){console.error('Simpan transaksi BHP gagal:',err); const msg=err?.code==='permission-denied' ? 'Firestore Rules menolak akses bhpTransactions. Tambahkan izin read/write untuk Admin/Teknisi.' : ('Gagal menyimpan transaksi: '+(err.message||err)); showToast(msg,'error');}}
        function populasikanDropdownBHPDiLK(filterText=''){
            const s=document.getElementById('dlk-bhp-item'); if(!s)return;
            const old=s.value; const q=String(filterText||document.getElementById('dlk-bhp-search')?.value||'').toLowerCase().trim();
            const rows=dataBHPItems.filter(i=>!q||[i.namaItem,i.namaAlkes,i.spesifikasi,i.jenisItem].some(v=>String(v||'').toLowerCase().includes(q)));
            s.innerHTML='<option value="">-- Pilih BHP / Aksesoris --</option>'+rows.map(i=>{const st=getStokBHP(i.id);return `<option value="${escBHP(i.id)}">${escBHP(i.namaItem)} — ${escBHP(i.namaAlkes)} · ${st.stok} ${escBHP(i.satuan||'')}</option>`}).join('');
            if(rows.some(i=>String(i.id)===old))s.value=old;
            updateStokInfoBHPDiLK(); renderBHPUsageLK();
        }
        function filterDropdownBHPDiLK(q){ populasikanDropdownBHPDiLK(q); }
        function updateStokInfoBHPDiLK(){
            const box=document.getElementById('dlk-bhp-stock-info'), sel=document.getElementById('dlk-bhp-item'); if(!box||!sel)return;
            const item=dataBHPItems.find(x=>String(x.id)===String(sel.value));
            if(!item){box.innerHTML='<span class="text-slate-400"><i class="fa-solid fa-circle-info mr-1"></i>Pilih item untuk melihat stok tersedia.</span>';return;}
            const st=getStokBHP(item.id); const status=statusStokBHP(item);
            const cls=status==='habis'?'text-rose-600':status==='menipis'?'text-amber-600':'text-emerald-700';
            box.innerHTML=`<span class="${cls}"><i class="fa-solid fa-box mr-1"></i>Stok tersedia: <b>${st.stok} ${escBHP(item.satuan||'')}</b> · Minimum ${angkaBHP(item.stokMinimum)}</span>`;
        }
        function renderBHPUsageLKPrint(){
            const body=document.getElementById('dlk-bhp-print-body');
            const count=document.getElementById('dlk-bhp-print-count');
            if(count) count.textContent=`${bhpUsageLK.length} item${bhpUsageLK.length===1?'':'s'}`;
            if(!body) return;
            if(!bhpUsageLK.length){
                body.innerHTML='<div class="lk-bhp-print-empty">Tidak ada BHP / aksesoris yang digunakan pada LK ini.</div>';
                return;
            }
            body.innerHTML=`<table class="lk-bhp-print-table"><thead><tr><th style="width:34%">BHP / Aksesoris</th><th style="width:28%">Alkes</th><th style="width:16%">Jenis</th><th style="width:10%">Qty</th><th style="width:12%">Satuan</th></tr></thead><tbody>${bhpUsageLK.map(u=>{
                const item=dataBHPItems.find(x=>String(x.id)===String(u.itemId))||{};
                return `<tr><td><b>${escBHP(item.namaItem||u.namaItem||'-')}</b>${item.spesifikasi?`<br><span style="color:#64748b">${escBHP(item.spesifikasi)}</span>`:''}</td><td>${escBHP(item.namaAlkes||u.namaAlkes||'-')}</td><td>${escBHP(item.jenisItem||u.jenisItem||'-')}</td><td style="text-align:center;font-weight:900">${angkaBHP(u.qty)}</td><td>${escBHP(item.satuan||u.satuan||'-')}</td></tr>`;
            }).join('')}</tbody></table>`;
        }

        function renderBHPUsageLK(){
            const body=document.getElementById('dlk-bhp-list'), empty=document.getElementById('dlk-bhp-empty'), count=document.getElementById('dlk-bhp-count'); if(!body)return;
            const usage=Array.isArray(bhpUsageLK)?bhpUsageLK:[];
            body.innerHTML=usage.map((u,i)=>{const item=dataBHPItems.find(x=>String(x.id)===String(u.itemId))||u;return `<div class="lk-bhp-row"><div class="min-w-0"><div class="font-black text-slate-800 text-[10px] truncate">${escBHP(item.namaItem||u.namaItem||'-')}</div><div class="lk-bhp-meta text-[8px] text-slate-500 truncate">${escBHP(item.namaAlkes||u.namaAlkes||'-')}</div></div><div class="lk-bhp-stock-pill">${angkaBHP(u.qty)} ${escBHP(item.satuan||u.satuan||'')}</div><button type="button" class="lk-bhp-remove" onclick="hapusBHPDariLK(${i})"><i class="fa-solid fa-trash"></i></button></div>`}).join('');
            if(empty) empty.style.display=usage.length?'none':'block';
            if(count) count.textContent=`${usage.length} item`;
            renderBHPUsageLKPrint();
            const area=document.getElementById('area-lembar-kerja-resmi');
            const locked=!!area?.classList.contains('medix-lk-locked');
            const editor=document.querySelector('#area-lembar-kerja-resmi .lk-bhp-usage-card');
            const summary=document.getElementById('dlk-bhp-print-summary');
            if(locked){ if(editor) editor.style.display='none'; if(summary) summary.style.display='block'; }
            else { if(editor) editor.style.display=''; if(summary) summary.style.display='none'; }
        }
        function tambahBHPKeLK(){
            const itemId=document.getElementById('dlk-bhp-item')?.value,qty=angkaBHP(document.getElementById('dlk-bhp-qty')?.value);
            if(!itemId||qty<=0){showToast('Pilih BHP dan isi jumlah terlebih dahulu.','error');return;}
            const item=dataBHPItems.find(x=>String(x.id)===String(itemId)); if(!item)return;
            const available=hitungStokTersediaBHP(itemId, window._medixEditingLkId||''); const existing=bhpUsageLK.find(x=>String(x.itemId)===String(itemId)); const currentQty=existing?angkaBHP(existing.qty):0;
            if(qty+currentQty>available){showToast(`Jumlah pemakaian melebihi stok tersedia (${available} ${item.satuan||''}).`,'error');return;}
            if(existing)existing.qty=currentQty+qty; else bhpUsageLK.push({itemId,qty,namaItem:item.namaItem,namaAlkes:item.namaAlkes,jenisItem:item.jenisItem,satuan:item.satuan});
            renderBHPUsageLK(); document.getElementById('dlk-bhp-qty').value=1; document.getElementById('dlk-bhp-item').value=''; updateStokInfoBHPDiLK();
        }
        function hapusBHPDariLK(i){bhpUsageLK.splice(i,1);renderBHPUsageLK();}
        function hitungStokTersediaBHP(itemId, excludeLkId=''){const s=getStokBHP(itemId);let out=0;dataBHPTransactions.filter(t=>String(t.itemId)===String(itemId)&&String(t.lkId||'')===String(excludeLkId)).forEach(t=>{if(String(t.tipe)==='OUT')out+=angkaBHP(t.qty);});return s.stok+out;}
        function siapkanTransaksiBHPUntukLK(batch, lkId, noLk, alatId, tanggal, usage){usage.forEach(u=>{if(angkaBHP(u.qty)<=0)return;const ref=db.collection('bhpTransactions').doc();batch.set(ref,{itemId:u.itemId,tipe:'OUT',qty:angkaBHP(u.qty),tanggal,tanggalLk:tanggal,lkId,noLk,alatId,sumber:'LK',keterangan:`Pemakaian BHP pada ${noLk}`,createdByUid:auth.currentUser?.uid||'',createdByNama:currentUserNama||'',createdAt:firebase.firestore.FieldValue.serverTimestamp()});});}
        async function sinkronkanTransaksiBHPUntukLK(existingLkId, newUsage, batch, noLk, alatId, tanggal){
            if(existingLkId){const oldSnap=await db.collection('bhpTransactions').where('lkId','==',existingLkId).get();oldSnap.forEach(d=>batch.delete(d.ref));}
            siapkanTransaksiBHPUntukLK(batch, existingLkId||'TEMP', noLk, alatId, tanggal, newUsage);
        }

        function switchTab(tId) {
            syncMasterHeaderActions();
            const menuMap = { dashboard: 'dashboard', 'data-alat': 'master', 'ticket-system': 'ticket', kalibrasi: 'kalibrasi', equipment: 'equipment', bhp: 'bhp', 'kelola-akun': 'akun' };
            const menu = menuMap[tId];
            if (menu && !(menu === 'ticket' && canonicalRole(currentActiveRole) === 'User') && !izinMenu(menu, 'read')) {
                showToast('Akses menu ini tidak diberikan untuk akun Anda.', 'error');
                return;
            }
            document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden')); 
            const targetTab = document.getElementById('tab-' + tId);
            if(targetTab) targetTab.classList.remove('hidden');
            if (tId === 'ticket-system') { ensureUserEticketForm(); requestAnimationFrame(() => ensureUserEticketForm()); }
            if (tId === 'bhp') { renderBHPTable(); renderBHPRecapLK(); } 
            document.querySelectorAll('.sidebar-item').forEach(e => e.classList.remove('active')); 
            const btnEl = document.getElementById('btn-' + tId);
            if(btnEl) btnEl.classList.add('active'); 
            toggleSidebarMenu(false); 
            if(tId === 'dashboard') {
                setTimeout(() => {
                    renderGrafikDashboardDinamis();
                    renderGrafikTrenKerusakan();
                }, 300);
            }
            if (riwayatNavigasiTab[riwayatNavigasiTab.length - 1] !== tId) { riwayatNavigasiTab.push(tId); }
            renderBottomNavigation(tId);
        }
        
        function toggleSidebarMenu(s) {
            const sb = document.getElementById('app-sidebar');
            const mainArea = document.getElementById('main-content-area');
            const backdrop = document.getElementById('medix-mobile-backdrop');
            if (!sb) return;
            const isDesktop = window.innerWidth >= 1024;
            if (isDesktop) {
                const collapsed = document.body.classList.contains('medix-sidebar-collapsed');
                if (s === false) return;
                const open = s === true ? true : collapsed;
                document.body.classList.toggle('medix-sidebar-collapsed', !open);
                sb.classList.remove('-translate-x-full');
                sb.classList.toggle('medix-sidebar-open', open);
                if (mainArea) { mainArea.style.marginLeft = open ? '17rem' : '0rem'; mainArea.style.width = open ? 'calc(100% - 17rem)' : '100%'; }
                if (backdrop) backdrop.classList.remove('show');
                document.body.classList.remove('medix-drawer-open');
                return;
            }
            const open = s === true ? true : (s === false ? false : !sb.classList.contains('medix-sidebar-open'));
            sb.classList.toggle('medix-sidebar-open', open);
            sb.classList.toggle('-translate-x-full', !open);
            if (mainArea) { mainArea.style.marginLeft = '0rem'; mainArea.style.width = '100%'; }
            if (backdrop) backdrop.classList.toggle('show', open);
            document.body.classList.toggle('medix-drawer-open', open);
        }

        function sinkronkanShellResponsiveMEDIX() {
            const sb = document.getElementById('app-sidebar');
            const mainArea = document.getElementById('main-content-area');
            const backdrop = document.getElementById('medix-mobile-backdrop');
            if (!sb) return;
            if (window.innerWidth >= 1024) {
                const collapsed = document.body.classList.contains('medix-sidebar-collapsed');
                sb.classList.remove('-translate-x-full');
                sb.classList.remove('medix-sidebar-open');
                document.body.classList.remove('medix-drawer-open');
                if (backdrop) backdrop.classList.remove('show');
                if (mainArea) { mainArea.style.marginLeft = collapsed ? '0rem' : '17rem'; mainArea.style.width = collapsed ? '100%' : 'calc(100% - 17rem)'; }
            } else {
                document.body.classList.remove('medix-sidebar-collapsed');
                const open = sb.classList.contains('medix-sidebar-open');
                sb.classList.toggle('-translate-x-full', !open);
                if (mainArea) { mainArea.style.marginLeft = '0rem'; mainArea.style.width = '100%'; }
                document.body.classList.toggle('medix-drawer-open', open);
                if (backdrop) backdrop.classList.toggle('show', open);
            }
        }

        window.addEventListener('resize', sinkronkanShellResponsiveMEDIX);
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const sb = document.getElementById('app-sidebar');
                if (window.innerWidth < 1024 && sb && sb.classList.contains('medix-sidebar-open')) toggleSidebarMenu(false);
            }
        });


        function clickDashboardStat(t) { 
            if(t === 'all'){ globalFilterStatus = "all"; switchTab('data-alat'); } 
            else if(t === 'ready'){ globalFilterStatus = "Siap Digunakan"; switchTab('data-alat'); } 
            else if(t === 'broken'){ switchTab('ticket-system'); } 
            else if(t === 'docs'){ switchTab('kalibrasi'); gantiSubTabDokumen('all'); } 
            renderAll(); 
        }

        function parseOptionalNumber(id) {
            const el = document.getElementById(id);
            if (!el || el.value === '') return null;
            const n = Number(el.value);
            return Number.isFinite(n) ? n : null;
        }

        function updateFormAlatEMPreview() {
            const box = document.getElementById('form-alat-em-preview');
            if (!box) return;
            const vals = ['form-alat-em-fungsi','form-alat-em-risiko','form-alat-em-perawatan','form-alat-em-insiden'].map(parseOptionalNumber);
            if (vals.every(v => v !== null)) {
                const total = vals.reduce((a,b) => a+b, 0);
                const periode = hitungRekomendasiPeriodeWHO(total);
                box.innerHTML = `<b>Nilai EM:</b> ${total} &nbsp; | &nbsp; <b>Rekomendasi:</b> ${periode}`;
            } else {
                box.textContent = 'Nilai EM dan periode PM akan dihitung setelah 4 komponen lengkap. Jika belum dinilai, sistem tidak membuat jadwal PM otomatis.';
            }
        }

        function pasangListenerFormEM() {
            ['form-alat-em-fungsi','form-alat-em-risiko','form-alat-em-perawatan','form-alat-em-insiden'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', updateFormAlatEMPreview);
            });
        }

        function ambilNilaiEMDariEquipment(asset) {
            if (!asset) return null;
            const list = Array.isArray(dataEquipment) ? dataEquipment : [];
            const byId = list.find(item => String(item.assetId || item.id || '') === String(asset.id || ''));
            if (byId && [byId.emFungsi, byId.emRisiko, byId.emPerawatan, byId.emInsiden].every(v => v !== null && v !== undefined)) return byId;
            const key = normalisasiNamaEM(asset.nama || asset.namaAlat || '');
            if (!key) return null;
            return list.find(item => normalisasiNamaEM(item.namaAlat || '') === key && [item.emFungsi,item.emRisiko,item.emPerawatan,item.emInsiden].every(v => v !== null && v !== undefined)) || null;
        }

        async function sinkronkanEMMasterDariProfil() {
            if (!Array.isArray(dataAlat) || !dataAlat.length || !db) return;
            const updates = [];
            dataAlat.forEach(asset => {
                const existingComplete = [asset.emFungsi, asset.emRisiko, asset.emPerawatan, asset.emInsiden].every(v => v !== null && v !== undefined && v !== '');
                if (existingComplete) return;
                const profil = cariProfilEM(asset.nama || asset.namaAlat || '');
                if (!profil) return;
                const payload = {};
                if (asset.emFungsi == null || asset.emFungsi === '') payload.emFungsi = profil.fungsi;
                if (asset.emRisiko == null || asset.emRisiko === '') payload.emRisiko = profil.risiko;
                if (asset.emPerawatan == null || asset.emPerawatan === '') payload.emPerawatan = profil.perawatan;
                if (asset.emInsiden == null || asset.emInsiden === '') payload.emInsiden = profil.insiden;
                if (Object.keys(payload).length) {
                    updates.push({id: asset.id, payload});
                    Object.assign(asset, payload);
                }
            });
            for (let i = 0; i < updates.length; i += 450) {
                const batch = db.batch();
                updates.slice(i, i + 450).forEach(op => batch.set(db.collection('dataAlat').doc(op.id), {...op.payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}, {merge:true}));
                await batch.commit();
            }
            if (updates.length) console.info(`Sinkronisasi EM otomatis: ${updates.length} aset diperbarui.`);
        }

        function openModalAlatManual() { 
            if (currentActiveRole !== 'Admin' || !izinMenu('master', 'tambah')) { showToast('Anda tidak memiliki izin menambah aset.', 'error'); return; }
            document.getElementById('form-alat-id').value = ""; 
            document.getElementById('form-alat-nama').value = ""; 
            document.getElementById('form-alat-merk').value = ""; 
            document.getElementById('form-alat-tipe').value = ""; 
            document.getElementById('form-alat-seri').value = ""; 
            document.getElementById('form-alat-izin').value = ""; 
            document.getElementById('form-alat-lokasi').value = "";
            ['form-alat-em-fungsi','form-alat-em-risiko','form-alat-em-perawatan','form-alat-em-insiden'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
            updateFormAlatEMPreview();
            toggleModal('modal-alat', true); 
        }
        
        function pemicuEditAlatLangsung(id) { 
            if (currentActiveRole !== 'Admin' || !izinMenu('master', 'edit')) { showToast('Anda tidak memiliki izin mengedit aset.', 'error'); return; }
            const a = dataAlat.find(i => i.id == id); if(!a) return; 
            document.getElementById('form-alat-id').value = a.id; 
            document.getElementById('form-alat-nama').value = a.nama || ''; 
            document.getElementById('form-alat-merk').value = a.merk || ''; 
            document.getElementById('form-alat-tipe').value = a.tipe || ''; 
            document.getElementById('form-alat-seri').value = a.seri || ''; 
            document.getElementById('form-alat-izin').value = a.izinEdar || a.edar || ''; 
            document.getElementById('form-alat-lokasi').value = a.ruangan || a.lokasi || '';
            const em = ambilNilaiEMDariEquipment(a) || normalisasiAssetUntukEquipment(a, 0, {}) || a;
            document.getElementById('form-alat-em-fungsi').value = em.emFungsi ?? '';
            document.getElementById('form-alat-em-risiko').value = em.emRisiko ?? '';
            document.getElementById('form-alat-em-perawatan').value = em.emPerawatan ?? '';
            document.getElementById('form-alat-em-insiden').value = em.emInsiden ?? '';
            updateFormAlatEMPreview();
            toggleModal('modal-alat', true); 
        }

        function submitFormAlatMaster(e) { 
            e.preventDefault();
            const idAsetForm = document.getElementById('form-alat-id').value;
            if (currentActiveRole !== 'Admin' || !(idAsetForm ? izinMenu('master', 'edit') : izinMenu('master', 'tambah'))) { showToast('Anda tidak memiliki izin untuk menyimpan perubahan aset.', 'error'); return; } 
            const id = document.getElementById('form-alat-id').value;
            const namaForm = document.getElementById('form-alat-nama').value.trim();
            const seriForm = document.getElementById('form-alat-seri').value.trim();
            if (!namaForm) { showToast('Nama alat wajib diisi.', 'error'); return; }
            if (seriForm) {
                const duplicate = dataAlat.find(a => String(a.seri || '').trim().toLowerCase() === seriForm.toLowerCase() && String(a.id) !== String(id));
                if (duplicate) { showToast('Nomor seri sudah digunakan oleh aset lain.', 'error'); return; }
            }
            const emValues = ['form-alat-em-fungsi','form-alat-em-risiko','form-alat-em-perawatan','form-alat-em-insiden'].map(id => document.getElementById(id)?.value);
            const anyEM = emValues.some(v => v !== '');
            const completeEM = emValues.every(v => v !== '');
            if (anyEM && !completeEM) { showToast('Jika penilaian EM diisi, semua 4 komponen harus lengkap.', 'error'); return; }
            const payload = { 
                nama: document.getElementById('form-alat-nama').value, merk: document.getElementById('form-alat-merk').value, 
                tipe: document.getElementById('form-alat-tipe').value, seri: document.getElementById('form-alat-seri').value, 
                izinEdar: document.getElementById('form-alat-izin').value, ruangan: document.getElementById('form-alat-lokasi').value,
                emFungsi: parseOptionalNumber('form-alat-em-fungsi'),
                emRisiko: parseOptionalNumber('form-alat-em-risiko'),
                emPerawatan: parseOptionalNumber('form-alat-em-perawatan'),
                emInsiden: parseOptionalNumber('form-alat-em-insiden')
            }; 
            if(id) { 
                db.collection("dataAlat").doc(id).update(payload).then(() => { 
                    toggleModal('modal-alat', false); 
                    showToast("Aset berhasil diperbarui!", "success"); 
                }); 
            } else { 
                payload.status = 'Siap Digunakan'; 
                db.collection("dataAlat").add(payload).then(() => { 
                    toggleModal('modal-alat', false); 
                    showToast("Aset baru berhasil didaftarkan!", "success"); 
                }); 
            } 
        }

        // ============================================================
        // SISTEM HAK AKSES MEDIX v6
        // Role menentukan preset awal, checkbox menentukan detail menu.
        // Hak akses UI tetap dilindungi oleh role + Firestore Rules.
        // ============================================================
        const MEDIX_ACCESS_PRESETS = {
            Admin: {
                dashboard: { read: true, edit: true },
                master: { read: true, tambah: true, edit: true, hapus: true, import: true, export: true },
                ticket: { read: true, lapor: true, kerjakan: true, selesai: true, hapus: true, edit: true },
                equipment: { read: true, maintenance: true, edit: true },
                riwayat: { read: true, upload: true, download: true, hapus: true, edit: true },
                akun: { read: true, edit: true, nonaktifkan: true },
                lk: { read: true, create: true, edit: true, print: true },
                kalibrasi: { read: true, upload: true, hapus: true },
                bhp: { read: true, edit: true },
                label: { print: true },
                qr: { manage: true }
            },
            Teknisi: {
                dashboard: { read: true, edit: false },
                master: { read: true, tambah: false, edit: false, hapus: false, import: false, export: true },
                ticket: { read: true, lapor: false, kerjakan: true, selesai: true, hapus: false, edit: true },
                equipment: { read: true, maintenance: true, edit: true },
                riwayat: { read: true, upload: true, download: true, hapus: false, edit: true },
                akun: { read: false, edit: false, nonaktifkan: false },
                lk: { read: true, create: true, edit: true, print: true },
                kalibrasi: { read: true, upload: true, hapus: false },
                bhp: { read: true, edit: true },
                label: { print: true },
                qr: { manage: true }
            },
            User: {
                dashboard: { read: true, edit: false },
                master: { read: false, tambah: false, edit: false, hapus: false, import: false, export: false },
                ticket: { read: true, lapor: true, kerjakan: false, selesai: false, hapus: false, edit: false },
                equipment: { read: false, maintenance: false, edit: false },
                riwayat: { read: true, upload: false, download: true, hapus: false, edit: false },
                akun: { read: false, edit: false, nonaktifkan: false },
                lk: { read: true, create: false, edit: false, print: true },
                kalibrasi: { read: true, upload: false, hapus: false },
                bhp: { read: false, edit: false },
                label: { print: false },
                qr: { manage: false }
            }
        };

        function cloneAccessPreset(role) {
            const preset = MEDIX_ACCESS_PRESETS[role] || MEDIX_ACCESS_PRESETS.User;
            return JSON.parse(JSON.stringify(preset));
        }

        function normalisasiMenuAkses(raw, role = 'User') {
            role = canonicalRole(role);
            const base = cloneAccessPreset(role);
            const src = raw || {};
            Object.keys(base).forEach(menu => {
                if (!src[menu] || typeof src[menu] !== 'object') return;
                Object.keys(base[menu]).forEach(action => {
                    if (typeof src[menu][action] === 'boolean') base[menu][action] = src[menu][action];
                });
            });
            // Kompatibilitas dengan struktur lama MEDIX.
            if (src.master?.edit === true) base.master.edit = true;
            if (src.ticket?.edit === true) base.ticket.kerjakan = true;
            if (src.riwayat?.edit === true) base.riwayat.upload = true;
            if (src.dashboard?.edit === true) base.dashboard.edit = true;
            // Hak tindakan otomatis membutuhkan hak Lihat pada menu terkait.
            base.master.read = !!(base.master.read || base.master.tambah || base.master.edit || base.master.hapus || base.master.import || base.master.export);
            base.ticket.read = !!(base.ticket.read || base.ticket.lapor || base.ticket.kerjakan || base.ticket.selesai || base.ticket.hapus);
            base.equipment.read = !!(base.equipment.read || base.equipment.maintenance || base.equipment.edit);
            base.equipment.maintenance = !!(base.equipment.maintenance || base.equipment.edit);
            base.riwayat.read = !!(base.riwayat.read || base.riwayat.upload || base.riwayat.download || base.riwayat.hapus);
            base.akun.read = !!(base.akun.read || base.akun.edit || base.akun.nonaktifkan);
            // Tidak ada lagi override paksa berdasarkan role untuk Equipment/Tiket.
            // Admin mengatur detail akses akun langsung dari menu Kelola Akun.

            // Kelola akun hanya Admin.
            if (role !== 'Admin') base.akun = { read: false, edit: false, nonaktifkan: false };
            base.lk = { read: !!base.lk?.read, create: !!base.lk?.create, edit: !!base.lk?.edit, print: !!base.lk?.print };
            base.kalibrasi = { read: !!base.kalibrasi?.read, upload: !!base.kalibrasi?.upload, hapus: !!base.kalibrasi?.hapus };
            base.bhp = { read: !!base.bhp?.read, edit: !!base.bhp?.edit };
            base.label = { print: !!base.label?.print };
            base.qr = { manage: !!base.qr?.manage };
            return base;
        }

        function izinMenu(menu, action = 'read') {
            const role = currentActiveRole || 'User';
            if (menu === 'equipment') {
                return (role === 'Admin' || role === 'Teknisi') && !!userAksesMenuArray?.equipment?.[action];
            }
            if (menu === 'akun') return role === 'Admin' && !!userAksesMenuArray?.akun?.[action];
            return !!userAksesMenuArray?.[menu]?.[action];
        }

        function terapkanPresetIzinRole(role) {
            const preset = cloneAccessPreset(role);
            const map = {
                'akses-dash-read': preset.dashboard.read,
                'akses-master-read': preset.master.read,
                'akses-master-tambah': preset.master.tambah,
                'akses-master-edit': preset.master.edit,
                'akses-master-hapus': preset.master.hapus,
                'akses-master-import': preset.master.import,
                'akses-master-export': preset.master.export,
                'akses-ticket-read': preset.ticket.read,
                'akses-ticket-lapor': preset.ticket.lapor,
                'akses-ticket-kerjakan': preset.ticket.kerjakan,
                'akses-ticket-selesai': preset.ticket.selesai,
                'akses-ticket-hapus': preset.ticket.hapus,
                'akses-equipment-read': preset.equipment.read,
                'akses-equipment-maintenance': preset.equipment.maintenance,
                'akses-equipment-edit': preset.equipment.edit,
                'akses-riwayat-read': preset.riwayat.read,
                'akses-riwayat-upload': preset.riwayat.upload,
                'akses-riwayat-download': preset.riwayat.download,
                'akses-riwayat-hapus': preset.riwayat.hapus,
                'akses-akun-read': preset.akun.read,
                'akses-akun-edit': preset.akun.edit,
                'akses-akun-nonaktifkan': preset.akun.nonaktifkan,
                'akses-lk-read': preset.lk.read, 'akses-lk-create': preset.lk.create, 'akses-lk-edit': preset.lk.edit, 'akses-lk-print': preset.lk.print,
                'akses-cal-read': preset.kalibrasi.read, 'akses-cal-upload': preset.kalibrasi.upload, 'akses-cal-hapus': preset.kalibrasi.hapus,
                'akses-bhp-read': preset.bhp.read, 'akses-bhp-edit': preset.bhp.edit,
                'akses-label-print': preset.label.print, 'akses-qr-public': preset.qr.manage
            };
            Object.entries(map).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.checked = !!value;
            });
            const accountLocked = role !== 'Admin';
            ['akses-akun-read','akses-akun-edit','akses-akun-nonaktifkan'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = accountLocked;
            });
            const note = document.getElementById('akses-equipment-note');
            if (note) note.textContent = 'Akses Equipment Management dapat diatur per akun oleh Admin.';
        }

        function ambilMenuAksesDariForm() {
            return {
                dashboard: { read: !!document.getElementById('akses-dash-read')?.checked, edit: !!document.getElementById('akses-dash-read')?.checked },
                master: {
                    read: !!document.getElementById('akses-master-read')?.checked,
                    tambah: !!document.getElementById('akses-master-tambah')?.checked,
                    edit: !!document.getElementById('akses-master-edit')?.checked,
                    hapus: !!document.getElementById('akses-master-hapus')?.checked,
                    import: !!document.getElementById('akses-master-import')?.checked,
                    export: !!document.getElementById('akses-master-export')?.checked
                },
                ticket: {
                    read: !!document.getElementById('akses-ticket-read')?.checked,
                    lapor: !!document.getElementById('akses-ticket-lapor')?.checked,
                    kerjakan: !!document.getElementById('akses-ticket-kerjakan')?.checked,
                    selesai: !!document.getElementById('akses-ticket-selesai')?.checked,
                    hapus: !!document.getElementById('akses-ticket-hapus')?.checked,
                    edit: !!document.getElementById('akses-ticket-kerjakan')?.checked
                },
                equipment: {
                    read: !!document.getElementById('akses-equipment-read')?.checked,
                    maintenance: !!document.getElementById('akses-equipment-maintenance')?.checked,
                    edit: !!document.getElementById('akses-equipment-edit')?.checked
                },
                riwayat: {
                    read: !!document.getElementById('akses-riwayat-read')?.checked,
                    upload: !!document.getElementById('akses-riwayat-upload')?.checked,
                    download: !!document.getElementById('akses-riwayat-download')?.checked,
                    hapus: !!document.getElementById('akses-riwayat-hapus')?.checked,
                    edit: !!document.getElementById('akses-riwayat-upload')?.checked
                },
                akun: {
                    read: !!document.getElementById('akses-akun-read')?.checked,
                    edit: !!document.getElementById('akses-akun-edit')?.checked,
                    nonaktifkan: !!document.getElementById('akses-akun-nonaktifkan')?.checked
                },
                lk: { read: !!document.getElementById('akses-lk-read')?.checked, create: !!document.getElementById('akses-lk-create')?.checked, edit: !!document.getElementById('akses-lk-edit')?.checked, print: !!document.getElementById('akses-lk-print')?.checked },
                kalibrasi: { read: !!document.getElementById('akses-cal-read')?.checked, upload: !!document.getElementById('akses-cal-upload')?.checked, hapus: !!document.getElementById('akses-cal-hapus')?.checked },
                bhp: { read: !!document.getElementById('akses-bhp-read')?.checked, edit: !!document.getElementById('akses-bhp-edit')?.checked },
                label: { print: !!document.getElementById('akses-label-print')?.checked },
                qr: { manage: !!document.getElementById('akses-qr-public')?.checked }
            };
        }

        function isiFormIzinAkses(raw, role) {
            const m = normalisasiMenuAkses(raw, role);
            const map = {
                'akses-dash-read': m.dashboard.read,
                'akses-master-read': m.master.read,
                'akses-master-tambah': m.master.tambah,
                'akses-master-edit': m.master.edit,
                'akses-master-hapus': m.master.hapus,
                'akses-master-import': m.master.import,
                'akses-master-export': m.master.export,
                'akses-ticket-read': m.ticket.read,
                'akses-ticket-lapor': m.ticket.lapor,
                'akses-ticket-kerjakan': m.ticket.kerjakan,
                'akses-ticket-selesai': m.ticket.selesai,
                'akses-ticket-hapus': m.ticket.hapus,
                'akses-equipment-read': m.equipment.read,
                'akses-equipment-maintenance': m.equipment.maintenance,
                'akses-equipment-edit': m.equipment.edit,
                'akses-riwayat-read': m.riwayat.read,
                'akses-riwayat-upload': m.riwayat.upload,
                'akses-riwayat-download': m.riwayat.download,
                'akses-riwayat-hapus': m.riwayat.hapus,
                'akses-akun-read': m.akun.read,
                'akses-akun-edit': m.akun.edit,
                'akses-akun-nonaktifkan': m.akun.nonaktifkan,
                'akses-lk-read': m.lk.read, 'akses-lk-create': m.lk.create, 'akses-lk-edit': m.lk.edit, 'akses-lk-print': m.lk.print,
                'akses-cal-read': m.kalibrasi.read, 'akses-cal-upload': m.kalibrasi.upload, 'akses-cal-hapus': m.kalibrasi.hapus,
                'akses-bhp-read': m.bhp.read, 'akses-bhp-edit': m.bhp.edit,
                'akses-label-print': m.label.print, 'akses-qr-public': m.qr.manage
            };
            Object.entries(map).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.checked = !!value;
            });
            terapkanPresetIzinRoleLock(role);
        }

        function terapkanPresetIzinRoleLock(role) {
            const equipmentLocked = role === 'User';
            ['akses-equipment-read','akses-equipment-maintenance','akses-equipment-edit'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = equipmentLocked;
            });
            const accountLocked = role !== 'Admin';
            ['akses-akun-read','akses-akun-edit','akses-akun-nonaktifkan'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = accountLocked;
            });
            const note = document.getElementById('akses-equipment-note');
            if (note) note.textContent = role === 'User'
                ? 'Akses Equipment Management otomatis ditutup untuk User.'
                : 'Admin dan Teknisi otomatis memiliki akses Lihat + Maintenance + Kelola Equipment Management.';
        }

        function resetFormUser() {
            const ids = ['user-form-id','user-form-nama','user-form-username','user-form-password'];
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            const role = document.getElementById('user-form-role');
            if (role) role.value = 'User';
            terapkanPresetIzinRole('User');
            const title = document.getElementById('form-user-title');
            if (title) title.innerHTML = '<i class="fa-solid fa-user-plus mr-1.5"></i> Buat Akun';
            const btn = document.getElementById('btn-submit-user');
            if (btn) btn.innerText = 'Daftarkan Akun';
            const passwordEl = document.getElementById('user-form-password');
            if (passwordEl) { passwordEl.required = true; passwordEl.placeholder = 'Minimal 6 karakter (saat membuat akun)'; }
            const cancel = document.getElementById('btn-cancel-edit-user');
            if (cancel) cancel.classList.add('hidden');
        }

        async function buatAkunAuthSekunder(email, password) {
            if (!email || !password) throw new Error('Email dan password wajib diisi.');
            if (password.length < 6) throw new Error('Password minimal 6 karakter.');
            let secondaryApp = null;
            try {
                secondaryApp = firebase.app('medixUserProvisioning');
            } catch (e) {
                secondaryApp = firebase.initializeApp(firebaseConfig, 'medixUserProvisioning');
            }
            const secondaryAuth = secondaryApp.auth();
            try {
                const credential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
                return credential.user;
            } finally {
                try { await secondaryAuth.signOut(); } catch (e) {}
            }
        }

        async function importDataDariExcel(event) {
            const input = event?.target;
            const file = input?.files?.[0];
            if (!file) return;
            if (currentActiveRole !== 'Admin') {
                showToast('Hanya Admin yang dapat mengimpor Master Data Aset.', 'error');
                if (input) input.value = '';
                return;
            }
            if (typeof XLSX === 'undefined') {
                showToast('Library Excel belum tersedia.', 'error');
                return;
            }
            try {
                showToast('Membaca file Excel...', 'info');
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                if (!rows.length) throw new Error('Sheet pertama tidak memiliki data.');

                const norm = value => String(value ?? '').trim().toLowerCase().replace(/[\s_\-\/]+/g, ' ');
                const pick = (row, names) => {
                    const entries = Object.entries(row);
                    for (const wanted of names) {
                        const wn = norm(wanted);
                        const found = entries.find(([k]) => norm(k) === wn || norm(k).includes(wn));
                        if (found && String(found[1]).trim() !== '') return String(found[1]).trim();
                    }
                    return '';
                };
                const existingByKey = new Map();
                dataAlat.forEach(a => {
                    const seri = norm(a.seri || a.serialNumber || '');
                    if (seri) existingByKey.set('seri|' + seri, a);
                    const key = [a.nama,a.merk,a.tipe,a.ruangan || a.lokasi].map(norm).join('|');
                    if (key.replace(/\|/g,'').trim()) existingByKey.set('key|' + key, a);
                });

                const operations = [];
                let skipped = 0;
                rows.forEach(row => {
                    const nama = pick(row, ['NAMA ALAT','NAMA ALKES','NAMA ALAT KESEHATAN','NAMA']);
                    if (!nama) { skipped++; return; }
                    const merk = pick(row, ['MERK','BRAND']);
                    const tipe = pick(row, ['MODEL/TIPE','TIPE','MODEL','TYPE']);
                    const seri = pick(row, ['SERIAL NUMBER','SERIAL NO','NO SERI','SERI','SN']);
                    const izinEdar = pick(row, ['IZIN EDAR','NOMOR IZIN EDAR','IZIN']);
                    const ruangan = pick(row, ['UNIT/RUANGAN','RUANGAN','UNIT','LOKASI']);
                    const status = pick(row, ['STATUS OPERASIONAL','STATUS']) || 'Siap Digunakan';
                    const emFungsi = pick(row, ['FUNGSI EM','EM FUNGSI','FUNGSI']);
                    const emRisiko = pick(row, ['RISIKO EM','EM RISIKO','RISIKO']);
                    const emPerawatan = pick(row, ['PERAWATAN EM','EM PERAWATAN','PERAWATAN']);
                    const emInsiden = pick(row, ['INSIDEN EM','EM INSIDEN','INSIDEN']);
                    const payload = { nama, merk, tipe, seri, izinEdar, ruangan, status,
                        emFungsi: emFungsi === '' ? null : Number(emFungsi),
                        emRisiko: emRisiko === '' ? null : Number(emRisiko),
                        emPerawatan: emPerawatan === '' ? null : Number(emPerawatan),
                        emInsiden: emInsiden === '' ? null : Number(emInsiden), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                    const keySeri = norm(seri);
                    const keyFull = [nama,merk,tipe,ruangan].map(norm).join('|');
                    const existing = (keySeri && existingByKey.get('seri|' + keySeri)) || existingByKey.get('key|' + keyFull);
                    if (existing) operations.push({ ref: db.collection('dataAlat').doc(existing.id), payload, mode: 'update' });
                    else operations.push({ ref: db.collection('dataAlat').doc(), payload: {...payload, createdAt: firebase.firestore.FieldValue.serverTimestamp()}, mode: 'add' });
                });
                if (!operations.length) throw new Error('Tidak ada baris valid yang dapat diimpor.');
                for (let i = 0; i < operations.length; i += 450) {
                    const batch = db.batch();
                    operations.slice(i, i + 450).forEach(op => batch.set(op.ref, op.payload, { merge: true }));
                    await batch.commit();
                }
                showToast(`Import selesai: ${operations.length} aset diproses${skipped ? `, ${skipped} baris dilewati` : ''}.`, 'success');
            } catch (error) {
                console.error('Import Master Data Aset gagal:', error);
                showToast('Import gagal: ' + (error.message || 'format file tidak valid.'), 'error');
            } finally {
                if (input) input.value = '';
            }
        }

        async function submitFormUserAdmin(e) {
            e.preventDefault();
            if (currentActiveRole !== 'Admin' || !izinMenu('akun', 'edit')) {
                showToast('Anda tidak memiliki izin untuk membuat atau mengubah akun.', 'error');
                return;
            }
            const id = document.getElementById('user-form-id').value.trim();
            const nama = document.getElementById('user-form-nama').value.trim();
            const email = document.getElementById('user-form-username').value.trim().toLowerCase();
            const passwordEl = document.getElementById('user-form-password');
            const password = passwordEl.value;
            if (!nama || !email || !email.includes('@')) return showToast('Nama dan email login harus diisi dengan benar.', 'error');
            const role = document.getElementById('user-form-role').value;
            const menuAksesPayload = normalisasiMenuAkses(ambilMenuAksesDariForm(), role);
            try {
                if (id) {
                    const payload = { nama, email, username: email, role: document.getElementById('user-form-role').value, menuAkses: menuAksesPayload, aktif: (dataUserSistem.find(u => u.id === id)?.aktif !== false), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                    await db.collection('users').doc(id).set(payload, { merge: true });
                    if (password) {
                        try {
                            const target = await auth.sendPasswordResetEmail(email);
                            showToast('Profil diperbarui. Password diubah melalui email reset.', 'success');
                        } catch (resetError) {
                            console.warn('Password reset email gagal:', resetError);
                            showToast('Profil diperbarui, tetapi email reset password gagal dikirim.', 'warning');
                        }
                    } else {
                        showToast('Akun berhasil diperbarui!', 'success');
                    }
                    resetFormUser();
                    return;
                }

                if (!password || password.length < 6) return showToast('Password akun baru minimal 6 karakter.', 'error');
                const authUser = await buatAkunAuthSekunder(email, password);
                const payload = { uid: authUser.uid, nama, email, username: email, role: document.getElementById('user-form-role').value, menuAkses: menuAksesPayload, aktif: true, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                await db.collection('users').doc(authUser.uid).set(payload, { merge: true });
                showToast(`Akun ${nama} berhasil dibuat dan siap digunakan untuk login.`, 'success');
                resetFormUser();
            } catch (error) {
                console.error('Gagal mengelola akun:', error);
                let msg = error.message || 'Operasi akun gagal.';
                if (error.code === 'auth/email-already-in-use') msg = 'Email tersebut sudah terdaftar di Firebase Authentication.';
                if (error.code === 'permission-denied') msg = 'Firestore menolak pembuatan profil akun. Periksa Security Rules users/{uid} untuk Admin.';
                showToast(msg, 'error');
            }
        }

        function renderDaftarUser() {
            const tbody = document.getElementById('table-user-body');
            if (!tbody) return;
            if (currentActiveRole !== 'Admin' || !izinMenu('akun', 'read')) { tbody.innerHTML = ''; return; }
            if (!Array.isArray(dataUserSistem) || dataUserSistem.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">Belum ada akun terdaftar.</td></tr>';
                return;
            }
            tbody.innerHTML = dataUserSistem.map(u => {
                const uid = u.id || u.uid || '';
                const nama = escapeHtmlEquipment(u.nama || '-');
                const email = escapeHtmlEquipment(u.email || u.username || '-');
                const role = escapeHtmlEquipment(u.role || 'User');
                const aktif = u.aktif !== false;
                const m = normalisasiMenuAkses(u.menuAkses || {}, u.role || 'User');
                const chips = [];
                if (m.dashboard.read) chips.push('Dashboard');
                if (m.master.read) chips.push('Master');
                if (m.ticket.read) chips.push('Tiket');
                if (m.equipment.read) chips.push('Equipment');
                if (m.riwayat.read) chips.push('Dokumen');
                if (m.akun.read) chips.push('Akun');
                if (m.lk.read) chips.push('LK');
                if (m.kalibrasi.read) chips.push('Kalibrasi');
                if (m.bhp.read) chips.push('BHP');
                if (m.label.print) chips.push('Label');
                return `<tr class="border-b border-slate-100">
                    <td class="p-3 font-semibold">${nama}<div class="text-[9px] text-slate-400">${aktif ? 'Aktif' : 'Nonaktif'}</div></td>
                    <td class="p-3 font-mono text-[10px]">${email}</td>
                    <td class="p-3"><span class="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold">${role}</span></td>
                    <td class="p-3"><div class="flex flex-wrap gap-1">${chips.map(c => `<span class="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[8px] font-bold">${c}</span>`).join('')}</div><div class="text-[8px] text-slate-400 mt-1">${[m.master.tambah&&'Tambah aset',m.master.edit&&'Edit aset',m.master.hapus&&'Hapus aset',m.master.import&&'Import aset',m.master.export&&'Export aset',m.ticket.lapor&&'Lapor tiket',m.ticket.kerjakan&&'Kerjakan tiket',m.ticket.selesai&&'Selesaikan tiket',m.ticket.hapus&&'Hapus tiket',m.riwayat.upload&&'Upload dokumen',m.riwayat.download&&'Download dokumen',m.riwayat.hapus&&'Hapus dokumen',m.equipment.maintenance&&'Maintenance EM/PM',m.equipment.edit&&'Kelola equipment',m.lk.create&&'Buat LK',m.lk.edit&&'Edit LK',m.lk.print&&'Cetak LK',m.kalibrasi.upload&&'Upload sertifikat',m.kalibrasi.hapus&&'Hapus kalibrasi',m.bhp.edit&&'Kelola BHP',m.label.print&&'Cetak label'].filter(Boolean).join(' • ') || 'Akses baca terbatas'}</div></td>
                    <td class="p-3 text-center whitespace-nowrap">
                        <button type="button" onclick="editAkunUserOlehAdmin('${uid}')" class="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-[10px] font-bold mr-1">Edit</button>
                        <button type="button" onclick="kirimResetPasswordAkun('${uid}')" class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-[10px] font-bold mr-1">Reset Password</button>
                        ${aktif ? `<button type="button" onclick="hapusAkunUserOlehAdmin('${uid}', '${nama.replace(/'/g, '&#39;')}')" class="bg-rose-50 text-rose-700 px-2 py-1 rounded-lg text-[10px] font-bold">Nonaktifkan</button>` : `<button type="button" onclick="aktifkanAkunUserOlehAdmin('${uid}', '${nama.replace(/'/g, '&#39;')}')" class="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-bold">Aktifkan</button>`}
                    </td>
                </tr>`;
            }).join('');
        }

        async function kirimResetPasswordAkun(userId) {
            if (currentActiveRole !== 'Admin' || !izinMenu('akun', 'edit')) return showToast('Anda tidak memiliki izin reset password.', 'error');
            const userObj = dataUserSistem.find(u => u.id === userId || u.uid === userId);
            const email = userObj?.email || userObj?.username || '';
            if (!email || !email.includes('@')) return showToast('Email akun tidak valid.', 'error');
            try {
                await auth.sendPasswordResetEmail(email);
                showToast('Email reset password berhasil dikirim.', 'success');
            } catch (error) {
                console.error('Reset password gagal:', error);
                showToast('Reset password gagal: ' + (error.message || ''), 'error');
            }
        }

        function editAkunUserOlehAdmin(userId) {
            if (currentActiveRole !== 'Admin' || !izinMenu('akun', 'edit')) return showToast('Anda tidak memiliki izin mengedit akun.', 'error');
            const userObj = dataUserSistem.find(u => u.id === userId);
            if(!userObj) return;
            document.getElementById('user-form-id').value = userObj.id;
            document.getElementById('user-form-nama').value = userObj.nama || '';
            document.getElementById('user-form-username').value = userObj.email || userObj.username || '';
            document.getElementById('user-form-password').value = '';
            document.getElementById('user-form-password').placeholder = 'Kosongkan jika password tidak diubah';
            document.getElementById('user-form-password').required = false;
            const role = userObj.role || 'User';
            document.getElementById('user-form-role').value = role;
            isiFormIzinAkses(userObj.menuAkses || {}, role);
            document.getElementById('form-user-title').innerHTML = `<i class="fa-solid fa-user-pen mr-1.5"></i> Edit Akun: ${userObj.nama}`;
            document.getElementById('btn-submit-user').innerText = "Simpan Perubahan";
            document.getElementById('btn-cancel-edit-user').classList.remove('hidden');
        }

        async function aktifkanAkunUserOlehAdmin(userId, namaUser) {
            if (currentActiveRole !== 'Admin' || !izinMenu('akun', 'nonaktifkan')) return showToast('Anda tidak memiliki izin mengaktifkan akun.', 'error');
            if (!userId) return showToast('ID akun tidak valid.', 'error');
            if (!await showConfirmDialog(`Aktifkan kembali akun "${namaUser}"?`, { title: 'Aktifkan Akun', okText: 'Aktifkan', icon: 'fa-user-check' })) return;
            try {
                await db.collection('users').doc(userId).set({ aktif: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                showToast(`Akun "${namaUser}" berhasil diaktifkan kembali.`, 'success');
            } catch (error) {
                console.error('Gagal mengaktifkan akun:', error);
                showToast('Gagal mengaktifkan akun: ' + (error.message || ''), 'error');
            }
        }

        async function hapusAkunUserOlehAdmin(userId, namaUser) {
            if (currentActiveRole !== 'Admin' || !izinMenu('akun', 'nonaktifkan')) return showToast('Anda tidak memiliki izin menonaktifkan akun.', 'error');
            if (!userId) return showToast('ID akun tidak valid.', 'error');
            if (!await showConfirmDialog(`Nonaktifkan akun "${namaUser}"? Akun Auth tidak dapat dihapus dari browser admin, jadi profil akan dinonaktifkan agar tidak dapat login ke MEDIX.`, { title: "Nonaktifkan Akun", okText: "Nonaktifkan", icon: "fa-user-slash" })) return;
            try {
                await db.collection("users").doc(userId).set({
                    aktif: false,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                showToast(`Akun "${namaUser}" berhasil dinonaktifkan.`, "success");
            } catch (error) {
                console.error('Gagal menonaktifkan akun:', error);
                showToast('Gagal menonaktifkan akun: ' + (error.message || ''), 'error');
            }
        }

        function gantiSubTabDokumen(t) { 
            subTabDokumenAktif = t; 
            const tabAll = document.getElementById('doc-tab-all');
            const tabCal = document.getElementById('doc-tab-kalibrasi');
            const tabMan = document.getElementById('doc-tab-mandiri');
            const tabSop = document.getElementById('doc-tab-sop');
            [tabAll, tabCal, tabMan, tabSop].forEach(btn => { if(btn) btn.className = "px-3 py-2 rounded-lg flex-1 text-center transition text-slate-600"; });
            if(t === 'all' && tabAll) tabAll.className = "px-3 py-2 rounded-lg flex-1 text-center bg-blue-600 text-white transition";
            if(t === 'kalibrasi' && tabCal) tabCal.className = "px-3 py-2 rounded-lg flex-1 text-center bg-blue-600 text-white transition";
            if(t === 'mandiri' && tabMan) tabMan.className = "px-3 py-2 rounded-lg flex-1 text-center bg-blue-600 text-white transition";
            if(t === 'sop' && tabSop) tabSop.className = "px-3 py-2 rounded-lg flex-1 text-center bg-blue-600 text-white transition";
            renderTabelPusatDokumen(); 
        }
        
        function toggleModal(id, s) { const el = document.getElementById(id); if(!el) return; el.classList.toggle('hidden', !s); if(s && ['modal-alat','modal-kalibrasi','modal-kartu','modal-preview','modal-scanner-publik'].includes(id)) el.classList.add('flex'); if(!s) el.classList.remove('flex'); document.body.classList.toggle('medix-modal-open', !!s); }

        function updateMasterTableNav() {
            const scroller = document.getElementById('master-table-scroll');
            const nav = document.getElementById('master-table-nav');
            const prev = document.getElementById('master-table-prev');
            const next = document.getElementById('master-table-next');
            if (!scroller || !nav || !prev || !next) return;
            const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
            const left = scroller.scrollLeft;
            const need = max > 2;
            nav.classList.toggle('hidden', !need);
            prev.disabled = !need || left <= 2;
            next.disabled = !need || left >= max - 2;
        }

        function initMasterTableNavigation() {
            const scroller = document.getElementById('master-table-scroll');
            if (!scroller || scroller.dataset.navReady === '1') { updateMasterTableNav(); return; }
            scroller.dataset.navReady = '1';
            scroller.addEventListener('scroll', updateMasterTableNav, { passive: true });
            window.addEventListener('resize', updateMasterTableNav);
            updateMasterTableNav();
            setTimeout(updateMasterTableNav, 300);
        }

        function filterAlat() {
            // Legacy compatibility. Table filtering is handled by the universal Excel-style filters.
            initMasterTableNavigation();
            if (window.medixInitTableFilters) window.medixInitTableFilters();
        }
        
        function updateStats() {
            const statTotal = document.getElementById('stat-total');
            const statReady = document.getElementById('stat-ready');
            const statBroken = document.getElementById('stat-broken');
            const statLogs = document.getElementById('stat-logs');
            if(statTotal) statTotal.innerText = dataAlat.length;
            if(statReady) statReady.innerText = dataAlat.filter(a => a.status === 'Siap Digunakan').length;
            if(statBroken) statBroken.innerText = dataAlat.filter(a => a.status === 'Dalam Perbaikan').length;
            let totalDocsCount = dataKalibrasi.length + dataPerbaikan.length + dataPM.length + dataInspeksi.length + dataBukuPetunjuk.length;
            dataKeluhanLog.forEach(lg => {
                const sudahAdaLk = [...dataPerbaikan, ...dataPM, ...dataInspeksi].some(lk => lk.alatId === lg.alatId);
                if (!sudahAdaLk) totalDocsCount++;
            });
            if(statLogs) statLogs.innerText = totalDocsCount;

            const dashEquipment = document.getElementById('dashboard-equipment-stat');
            const dashEquipmentTotal = document.getElementById('dash-equipment-total');
            const equipmentAllowed = typeof izinMenu === 'function' && izinMenu('equipment', 'read');
            if(dashEquipment) {
                dashEquipment.classList.toggle('hidden', !equipmentAllowed);
                dashEquipment.setAttribute('aria-hidden', equipmentAllowed ? 'false' : 'true');
            }
            if(dashEquipmentTotal) dashEquipmentTotal.textContent = dataAlat.length;
            const bhpAllowed = typeof izinMenu === 'function' && izinMenu('equipment', 'read');
            const dashBhp = document.getElementById('dashboard-bhp-stat');
            if (dashBhp) { dashBhp.classList.toggle('hidden', !bhpAllowed); dashBhp.setAttribute('aria-hidden', bhpAllowed ? 'false' : 'true'); }
            const bhpSummary = hitungRingkasanBHP();
            const dashBhpTotal = document.getElementById('dash-bhp-total');
            const dashBhpWarn = document.getElementById('dash-bhp-warning');
            if (dashBhpTotal) dashBhpTotal.textContent = bhpSummary.total;
            if (dashBhpWarn) dashBhpWarn.textContent = `${bhpSummary.menipis + bhpSummary.habis} perlu perhatian`;
            const bhpTotal = document.getElementById('bhp-stat-total');
            const bhpAman = document.getElementById('bhp-stat-aman');
            const bhpMenipis = document.getElementById('bhp-stat-menipis');
            const bhpHabis = document.getElementById('bhp-stat-habis');
            if (bhpTotal) bhpTotal.textContent = bhpSummary.total;
            if (bhpAman) bhpAman.textContent = bhpSummary.aman;
            if (bhpMenipis) bhpMenipis.textContent = bhpSummary.menipis;
            if (bhpHabis) bhpHabis.textContent = bhpSummary.habis;
        }
        
        function previewFotoDipilih(input) {
            const file = input.files[0];
            if(file) {
                const reader = new FileReader(); reader.readAsDataURL(file);
                reader.onload = function(e) {
                    const img = new Image(); img.src = e.target.result;
                    img.onload = function() {
                        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                        let max_size = 600; let w = img.width; let h = img.height;
                        if (w > h) { if (w > max_size) { h *= max_size / w; w = max_size; } } else { if (h > max_size) { w *= max_size / h; h = max_size; } }
                        canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
                        stringFotoBase64 = canvas.toDataURL('image/jpeg', 0.8);
                        document.getElementById('box-preview-foto').innerHTML = `<img src="${stringFotoBase64}" class="max-w-full max-h-full w-auto h-auto object-contain rounded" style="display:block;">`;
                        document.getElementById('dlk-input-foto-container').style.display = 'none';
                        document.getElementById('btn-retake-after').style.display = 'inline-block';
                    };
                };
            }
        }

        function resetFotoAfter() {
            if(currentActiveRole === 'User') return;
            stringFotoBase64 = "-"; document.getElementById('dlk-input-foto').value = "";
            resetFotoAfterDisplay();
        }

        function resetFotoAfterDisplay() {
            document.getElementById('box-preview-foto').innerHTML = `[ Ambil Foto Selesai ]`;
            document.getElementById('dlk-input-foto-container').style.display = 'block';
            document.getElementById('btn-retake-after').style.display = 'none';
        }

        function exportKeExcelMassal() {
            if (!izinMenu('master', 'export')) { showToast('Anda tidak memiliki izin Export Excel.', 'error'); return; }
            if(dataAlat.length === 0) return showToast("Tidak ada data alat untuk diexport!", "error");
            const dClean = dataAlat.map((a, index) => {
                const listCal = dataKalibrasi.filter(c => c.alatId === a.id);
                let tCal = "-", eCal = "-", vdr = "-";
                if(listCal.length > 0) { listCal.sort((x, y) => String(y.exp).localeCompare(String(x.exp))); tCal = listCal[0].tgl || "-"; eCal = listCal[0].exp || "-"; vdr = listCal[0].vendor || "-"; }
                return { 
                    "No": index + 1, "NAMA ALAT": a.nama || "-", "MERK": a.merk || "-", "MODEL/TIPE": a.tipe || "-", 
                    "SERIAL NUMBER": a.seri || "-", "IZIN EDAR": a.izinEdar || a.edar || "-", "UNIT/RUANGAN": a.ruangan || a.lokasi || "-", 
                    "Status Operasional": a.status || "-", "Tgl Kalibrasi Terakhir": tCal, "Habis Masa Berlaku": eCal, "Vendor Penguji": vdr 
                };
            });
            const ws = XLSX.utils.json_to_sheet(dClean); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Master Aset Medis"); XLSX.writeFile(wb, `MEDIX_DataAset_${new Date().toISOString().substring(0,10)}.xlsx`);
        }

        async function hapAlatMasterFirebase(id, namaAlat) { if (!izinMenu('master', 'hapus')) { showToast('Anda tidak memiliki izin menghapus aset.', 'error'); return; } if(await showConfirmDialog(`Hapus aset "${namaAlat}" permanen?`, { title: "Hapus Aset Permanen", okText: "Ya, Hapus", icon: "fa-trash-can" })) { db.collection("dataAlat").doc(id).delete().then(() => showToast("Aset berhasil dihapus!", "success")); } }
        
        async function hapusDokumenLogSpesifik(docId, koleksiNama) {
            if (!izinMenu('riwayat', 'hapus')) { showToast('Anda tidak memiliki izin menghapus dokumen.', 'error'); return; }
            if(currentActiveRole === 'User' && koleksiNama !== 'laporanKeluhanLog') { showToast("Akses ditolak!", "error"); return; }
            if(await showConfirmDialog("Apakah Anda yakin ingin menghapus dokumen log/riwayat ini dari database?", { title: "Hapus Dokumen Riwayat", okText: "Ya, Hapus", icon: "fa-trash-can" })) {
                db.collection(koleksiNama).doc(docId).delete().then(() => {
                    medixSyncCurrentAssetPublicHistory(globalSelectedAlatIdForLog || globalSelectedAlatIdUntukLog);
                    showToast("Dokumen log berhasil dihapus!", "success");
                    bukaKartuPemeliharaan(globalSelectedAlatIdForLog || globalSelectedAlatIdUntukLog); 
                });
            }
        }

        async function hapusDokumenPusatRiwayat(id, kol) { 
            if (!izinMenu('riwayat', 'hapus')) { showToast('Anda tidak memiliki izin menghapus dokumen arsip.', 'error'); return; }
            if(currentActiveRole === 'User' && kol !== 'laporanKeluhanLog') { showToast("Akses ditolak!", "error"); return; }
            if(await showConfirmDialog("Hapus dokumen arsip ini?", { title: "Hapus Dokumen Arsip", okText: "Ya, Hapus", icon: "fa-trash-can" })) { db.collection(kol).doc(id).delete().then(() => showToast("Dokumen arsip dibersihkan!", "success")); } 
        }

        function lihatFileLangsung(b, j, jdl) { 
            const body = document.getElementById('preview-body'); const titleEl = document.getElementById('preview-title');
            if(titleEl) titleEl.innerText = "Live Preview: " + jdl; 
            if(body) {
                if(j === 'pdf') body.innerHTML = `<iframe src="${b}" class="w-full h-full border rounded-xl" type="application/pdf"></iframe>`; 
                else body.innerHTML = `<div class="max-w-full p-2 flex justify-center"><img src="${b}" class="max-h-[70vh] rounded-xl object-contain"></div>`; 
            }
            toggleModal('modal-preview', true); 
        }

        function clearCanvasSignature(id) { 
            if(currentActiveRole === 'User') return;
            const c = document.getElementById(id); if(c) { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); ctx.beginPath(); } 
        }

        function switchKartuTab(tId) { 
            document.querySelectorAll('.kartu-tab').forEach(el => el.classList.remove('active')); 
            const btnTarget = document.getElementById('btn-'+tId.replace('tab-',''));
            if(btnTarget) btnTarget.classList.add('active'); 
            document.querySelectorAll('.kartu-content-box').forEach(el => el.classList.add('hidden')); 
            const contentBox = document.getElementById(tId);
            if(contentBox) contentBox.classList.remove('hidden'); 
        }
        
        // Mode publik Rekam Jejak: URL hasil scan kamera HP langsung membuka hanya kartu aset.
        let medixPublicRekamMode = false;
        let medixPublicRekamAssetId = '';
        function medixAktifkanModeRekamJejakPublik(assetId){
            medixPublicRekamMode = true;
            medixPublicRekamAssetId = String(assetId || medixPublicRekamAssetId || '').trim();
            document.body.classList.add('medix-public-rekam');
            // Tambahkan satu state khusus agar tombol Back tidak pernah membocorkan dashboard utama.
            try { window.history.pushState({ page:'rekam-jejak-public', assetId:medixPublicRekamAssetId }, '', window.location.href); } catch(e) {}
        }

        function bukaKartuPemeliharaan(alatId) {
            if (medixPublicRekamMode) {
                medixPublicRekamAssetId = String(alatId || medixPublicRekamAssetId || '').trim();
                document.body.classList.add('medix-public-rekam');
            }
            globalSelectedAlatIdForLog = alatId; globalSelectedAlatIdUntukLog = alatId; 
            const alat = dataAlat.find(a => a.id == alatId); if(!alat) return;
            let sLokasi = alat.ruangan || alat.lokasi || alat.edar || '-'; let sSeri = alat.seri || alat.tipe || '-';
            
            const kNama = document.getElementById('kartu-nama'); const kMerk = document.getElementById('kartu-merk');
            const kSeri = document.getElementById('kartu-seri'); const kLokasi = document.getElementById('kartu-lokasi');

            if(kNama) kNama.innerText = alat.nama; if(kMerk) kMerk.innerText = alat.merk || '-'; 
            if(kSeri) kSeri.innerText = sSeri || '-'; if(kLokasi) kLokasi.innerText = sLokasi || '-';
            
            const qrContainer = document.getElementById('qrcode-container');
            if (qrContainer && window.QRCode) {
                // Gunakan satu <img> final dari dataURL. Ini menghindari canvas/img
                // qrcodejs yang pada sebagian browser dapat bertumpuk atau tertutup CSS.
                qrContainer.innerHTML = '';
                // Gunakan payload QR CANONICAL yang sama persis dengan label yang bisa
                // dipindai. QR di Rekam Jejak sebelumnya memakai URL ?alat=...
                // sehingga hasil scan dapat berbeda dengan label yang di-download.
                // Render pada resolusi lebih tinggi, lalu tampilkan lebih kecil agar
                // modul QR tetap tajam saat dipindai kamera HP.
                const targetUrl = medixBuildQrValue(alat);
                try {
                    const qrDataUrl = medixGetQrDataUrl(targetUrl, 192);
                    const qrImg = document.createElement('img');
                    qrImg.src = qrDataUrl;
                    qrImg.alt = 'QR Rekam Jejak ' + String(alat.nama || 'Aset Medis');
                    qrImg.width = 104;
                    qrImg.height = 104;
                    qrImg.draggable = false;
                    qrImg.style.cssText = 'display:block!important;width:104px!important;height:104px!important;min-width:104px!important;min-height:104px!important;max-width:104px!important;max-height:104px!important;opacity:1!important;visibility:visible!important;background:#fff!important;object-fit:contain!important;transform:none!important;margin:0!important;border:0!important;';
                    qrContainer.appendChild(qrImg);
                } catch(e) {
                    console.error('QR Rekam Jejak gagal dibuat:', e);
                    qrContainer.innerHTML = '<span style="font:700 9px Arial;color:#94a3b8;text-align:center">QR belum tersedia</span>';
                }
            }
            
            switchKartuTab('tab-k-semua'); toggleModal('modal-kartu', true);

            const mapTim = t => (t && t.teknisiTtd) ? `<br><span class="text-[10px] text-indigo-600 font-bold">Teknisi: ${t.teknisiTtd}</span>` : '';
            const mapFoto = f => (f && f.fotoAlat && f.fotoAlat !== '-') ? `<td class="p-3 text-center"><button onclick="lihatFileLangsung('${f.fotoAlat}','img','Foto')" class="text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700">Foto</button></td>` : `<td class="p-3 text-center text-slate-400 italic">No Photo</td>`;
        
            let rekapSemua = [];
            dataPerbaikan.filter(r => r.alatId == alatId).forEach(r => rekapSemua.push({ tgl: r.textTgl || r.tgl || '', jenis: 'Corrective Maintenance', ket: `No LK: ${r.noLk||'-'} <br> ${r.desc_kerja||r.desc}`, hasil: r.hasilTunggal, id: r.id, tipeData: 'lk' }));
            dataPM.filter(p => p.alatId == alatId).forEach(p => rekapSemua.push({ tgl: p.textTgl || p.tgl || '', jenis: 'Preventive Maintenance', ket: `No LK: ${p.noLk||'-'} <br> ${p.desc_kerja||p.desc}`, hasil: p.hasilTunggal, id: p.id, tipeData: 'lk' }));
            dataInspeksi.filter(i => i.alatId == alatId).forEach(i => rekapSemua.push({ tgl: i.textTgl || i.tgl || '', jenis: 'Inspection', ket: `No LK: ${i.noLk||'-'} <br> ${i.desc_kerja||i.desc}`, hasil: i.hasilTunggal, id: i.id, tipeData: 'lk' }));
            dataMaintenance.filter(m => String(m.equipmentId || m.alatId || m.assetId || m.idAlat) == String(alatId)).forEach(m => rekapSemua.push({ tgl: m.tanggal || m.tgl || '', jenis: `EM / ${m.jenis||'Maintenance'}`, ket: `${m.tindakan||m.keluhan||m.keterangan||'-'}${m.teknisi ? ' · Teknisi: '+m.teknisi : ''}`, hasil: m.hasil || 'Tercatat', id: m.id, tipeData: 'maintenance' }));
            dataKalibrasi.filter(c => c.alatId == alatId).forEach(c => rekapSemua.push({ tgl: c.tgl || '', jenis: 'Sertifikat Kalibrasi', ket: `Vendor: ${c.vendor} | Exp: ${c.exp}`, hasil: c.hasil, id: c.id, tipeData: 'kalibrasi' }));
            rekapSemua.sort((x, y) => String(y.tgl).localeCompare(String(x.tgl)));
        
            const tbodySemua = document.getElementById('kartu-list-semua');
            if(tbodySemua) {
                if(rekapSemua.length === 0) { tbodySemua.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Belum ada rekapitulasi riwayat pekerjaan.</td></tr>`; } 
                else {
                    tbodySemua.innerHTML = rekapSemua.map(item => `
                        <tr class="border-b border-slate-100 hover:bg-slate-50">
                            <td class="p-3"><b>${item.jenis}</b><br><span class="text-[10px] text-slate-500 font-mono">${item.tgl.replace('T',' ')}</span></td>
                            <td class="p-3 text-slate-700">${item.ket}</td>
                            <td class="p-3 text-center"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${item.hasil.includes('Baik')||item.hasil==='Laik'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-rose-50 text-rose-700 border border-rose-200'}">${item.hasil}</span></td>
                            <td class="p-3 text-center">${item.tipeData === 'lk' ? `<button onclick="bukaLembarKerjaDinamisDarlLog('${item.id}')" class="bg-blue-600 text-white px-2.5 py-1 rounded text-[10px]">Lihat LK</button>` : item.tipeData === 'maintenance' ? `<span class="text-[10px] text-amber-600 font-mono">EM / Maintenance</span>` : `<span class="text-[10px] text-indigo-600 font-mono">Kalibrasi</span>`}</td>
                        </tr>
                    `).join('');
                }
            }
        
            const lkCorrective = document.getElementById('kartu-list-corrective');
            const lkPreventive = document.getElementById('kartu-list-preventive');
            const lkInspeksi = document.getElementById('kartu-list-inspeksi');
            const lkKalibrasi = document.getElementById('kartu-list-kalibrasi');

            if(lkCorrective) lkCorrective.innerHTML = dataPerbaikan.filter(r => r.alatId == alatId).map(r => `<tr><td class="p-3"><b>No LK:</b> ${r.noLk||'-'}<br><span class="text-[10px] text-slate-500 font-mono">${(r.textTgl||'-').replace('T',' ')}</span><br>${r.desc_kerja||r.desc} ${mapTim(r)}</td>${mapFoto(r)}<td>${r.hasilTunggal}</td><td class="text-center space-x-1"><button onclick="bukaLembarKerjaDinamisDarlLog('${r.id}')" class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">Lihat LK</button>${izinMenu('riwayat','hapus')?`<button onclick="hapusDokumenLogSpesifik('${r.id}', 'lembarKerja')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]"><i class="fa-solid fa-trash"></i></button>`:''}</td></tr>`).join('');
            if(lkPreventive) lkPreventive.innerHTML = dataPM.filter(p => p.alatId == alatId).map(p => `<tr><td class="p-3"><b>No LK:</b> ${p.noLk||'-'}<br><span class="text-[10px] text-slate-500 font-mono">${(p.textTgl||'-').replace('T',' ')}</span><br>${p.desc_kerja||p.desc||'-'} ${mapTim(p)}</td>${mapFoto(p)}<td>${p.hasilTunggal}</td><td class="text-center space-x-1"><button onclick="bukaLembarKerjaDinamisDarlLog('${p.id}')" class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">Lihat LK</button>${izinMenu('riwayat','hapus')?`<button onclick="hapusDokumenLogSpesifik('${p.id}', 'lembarKerja')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]"><i class="fa-solid fa-trash"></i></button>`:''}</td></tr>`).join('');
            if(lkInspeksi) lkInspeksi.innerHTML = dataInspeksi.filter(i => i.alatId == alatId).map(i => `<tr><td class="p-3"><b>No LK:</b> ${i.noLk||'-'}<br><span class="text-[10px] text-slate-500 font-mono">${(i.textTgl||'-').replace('T',' ')}</span><br>${i.desc_kerja||i.desc||'-'} ${mapTim(i)}</td>${mapFoto(i)}<td>${i.hasilTunggal}</td><td class="text-center space-x-1"><button onclick="bukaLembarKerjaDinamisDarlLog('${i.id}')" class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">Lihat LK</button>${izinMenu('riwayat','hapus')?`<button onclick="hapusDokumenLogSpesifik('${i.id}', 'lembarKerja')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]"><i class="fa-solid fa-trash"></i></button>`:''}</td></tr>`).join('');
            if(lkKalibrasi) lkKalibrasi.innerHTML = dataKalibrasi.filter(c => c.alatId == alatId).map(c => `<tr><td class="p-3 font-mono">${c.tgl||'-'}</td><td class="p-3 text-rose-600 font-bold">${c.exp||'-'}</td><td>${c.vendor||'-'}</td><td class="text-center space-x-1">${medixPublicRekamMode && !auth.currentUser ? `<span class="text-[10px] text-indigo-600 font-mono">Riwayat Publik</span>` : `<button onclick="bukaDokumenPusat('${c.id}','dataKalibrasi','pdf','Sertifikat')" class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded text-[10px]">PDF</button>`}${izinMenu('riwayat','hapus')?`<button onclick="hapusDokumenLogSpesifik('${c.id}', 'dataKalibrasi')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]"><i class="fa-solid fa-trash"></i></button>`:''}</td></tr>`).join('');
            
            const tbodyBuku = document.getElementById('kartu-list-buku-petunjuk');
            if(tbodyBuku) {
                const listBuku = dataBukuPetunjuk.filter(b => b.alatId == alatId);
                if(listBuku.length === 0) { tbodyBuku.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400 italic">Belum ada dokumen buku petunjuk / SOP diunggah.</td></tr>`; } 
                else {
                    tbodyBuku.innerHTML = listBuku.map(b => `
                        <tr class="border-b border-slate-100 hover:bg-slate-50">
                            <td class="p-4 font-bold text-slate-900"><i class="fa-solid fa-book text-cyan-600 mr-2"></i> ${b.namaFile}</td>
                            <td class="p-4 font-mono text-slate-500">${b.tglUpload}</td>
                            <td class="p-4 text-center space-x-1">
                                <button onclick="bukaDokumenPusat('${b.id}','bukuPetunjukAlat','${b.fileType || 'application/pdf'}','${String(b.namaFile || '').replace(/'/g, '\&#39;')}')" class="bg-blue-600 text-white px-3 py-1 rounded text-[10px] font-semibold"><i class="fa-solid fa-eye mr-1"></i> Preview</button>
                                ${izinMenu('riwayat','hapus')?`<button onclick="hapusBukuPetunjuk('${b.id}')" class="bg-rose-600 text-white px-2.5 py-1 rounded text-[10px]"><i class="fa-solid fa-trash"></i></button>`:''}
                            </td>
                        </tr>
                    `).join('');
                }
            }
        }

        // MEDIX Smart Asset Tag — satu standar untuk label satuan, massal, PDF, dan browser print.
        // QR selalu memakai payload canonical medixBuildQrValue(alat); token publik tidak dibuat ulang saat cetak.
        let medixLabelLogoDataUrlPromise = null;
        async function medixGetLabelLogoDataUrl(){
            if(medixLabelLogoDataUrlPromise) return medixLabelLogoDataUrlPromise;
            medixLabelLogoDataUrlPromise = new Promise((resolve,reject)=>{
                const img=new Image();
                img.onload=()=>{
                    try{
                        const c=document.createElement('canvas');
                        c.width=img.naturalWidth||512; c.height=img.naturalHeight||512;
                        const cx=c.getContext('2d'); cx.drawImage(img,0,0,c.width,c.height);
                        resolve(c.toDataURL('image/png'));
                    }catch(e){reject(e);}
                };
                img.onerror=()=>reject(new Error('Logo MEDIX tidak dapat dimuat dari assets/images/logo.png.'));
                img.src=new URL('assets/images/logo.png',document.baseURI).href;
            }).catch(err=>{medixLabelLogoDataUrlPromise=null;throw err;});
            return medixLabelLogoDataUrlPromise;
        }

        async function medixRenderAssetLabelCanvas(alat, options={}){
            if(!window.QRCode) throw new Error('Mesin QR Code belum termuat. Muat ulang aplikasi.');
            const W=1654,H=591; // 70 × 25 mm pada ~600 dpi
            const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
            const ctx=canvas.getContext('2d',{alpha:false});
            ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
            ctx.strokeStyle='#123047'; ctx.lineWidth=7; ctx.strokeRect(5,5,W-10,H-10);
            // Header identitas gabungan: logo eksisting + MEDIX + identitas RSUD.
            try{
                const logoUrl=await medixGetLabelLogoDataUrl();
                const logo=new Image();
                await new Promise((resolve,reject)=>{logo.onload=resolve;logo.onerror=reject;logo.src=logoUrl;});
                ctx.drawImage(logo,28,13,72,72);
            }catch(e){ console.warn('Logo label tidak tersedia; identitas teks tetap ditampilkan.',e); }
            ctx.textAlign='left'; ctx.textBaseline='alphabetic';
            ctx.fillStyle='#0f766e'; ctx.font='900 43px Arial,sans-serif'; ctx.fillText('MEDIX',116,48);
            ctx.fillStyle='#123047'; ctx.font='700 23px Arial,sans-serif'; ctx.fillText('UPTD RSUD KELAS D PONDOKGEDE',285,45);
            ctx.fillStyle='#64748b'; ctx.font='600 17px Arial,sans-serif'; ctx.fillText('IDENTITAS ASET KESEHATAN',285,70);
            ctx.strokeStyle='#dbe5eb'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(25,94); ctx.lineTo(W-25,94); ctx.stroke();

            // Quiet zone putih dipertahankan di sekeliling QR; QR hitam-putih tanpa logo overlay.
            const qrValue=medixBuildQrValue(alat);
            const qrData=medixGetQrDataUrl(qrValue,512);
            const qrImg=new Image();
            await new Promise((resolve,reject)=>{qrImg.onload=resolve;qrImg.onerror=()=>reject(new Error('QR Code gagal dirender.'));qrImg.src=qrData;});
            const qx=30,qy=111,qs=425,pad=36;
            ctx.fillStyle='#fff'; ctx.fillRect(qx,qy,qs,qs);
            ctx.drawImage(qrImg,qx+pad,qy+pad,qs-pad*2,qs-pad*2);
            ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=2; ctx.strokeRect(qx,qy,qs,qs);

            const tx=493,maxW=1125;
            const fit=(value,y,font,color='#0f172a',weight='700')=>{
                let text=String(value??'-').trim()||'-';
                ctx.font=`${weight} ${font}px Arial,sans-serif`;
                while(text.length>2 && ctx.measureText(text).width>maxW) text=text.slice(0,-2);
                if(text!==String(value??'-').trim()) text+='…';
                ctx.fillStyle=color; ctx.textAlign='left'; ctx.fillText(text,tx,y);
            };
            fit(alat.nama||alat.namaAlat||'ALAT KESEHATAN',218,59,'#123047','900');
            fit([alat.merk,alat.tipe].filter(Boolean).join(' · ')||'Merk / tipe tidak dicantumkan',303,39,'#475569','700');
            const kode=alat.kodeAlat||alat.kodeAset||alat.kode||alat.assetCode||alat.nomorAset||alat.id||'-';
            fit(`ID ${kode}   |   SN ${alat.seri||alat.serialNumber||'-'}`,385,34,'#334155','700');
            fit(`LOKASI ${alat.ruangan||alat.lokasi||'-'}`,463,34,'#0f766e','800');
            ctx.textAlign='center'; ctx.fillStyle='#64748b'; ctx.font='700 20px Arial,sans-serif';
            ctx.fillText('SCAN UNTUK MEMBUKA REKAM JEJAK ASET',W/2,565);
            return canvas;
        }

        async function downloadLabelBarcodeFisik() {
            const alatId=globalSelectedAlatIdForLog||globalSelectedAlatIdUntukLog;
            if(!alatId) return showToast('Aset belum dipilih.','info');
            const alat=(dataAlat||[]).find(a=>String(a.id)===String(alatId));
            if(!alat) return showToast('Data aset tidak ditemukan.','error');
            try{
                const tokensReady=await medixEnsurePublicTokensForAllAssets(false);
                if(tokensReady!==true) return;
                const canvas=await medixRenderAssetLabelCanvas(alat);
                canvas.toBlob(blob=>{
                    if(!blob) return showToast('Gagal membuat file label.','error');
                    const url=URL.createObjectURL(blob),link=document.createElement('a');
                    link.href=url;
                    link.download=`MEDIX_Label_${String(alat.kodeAlat||alat.id||'Aset').replace(/[^a-z0-9_-]+/gi,'_')}.png`;
                    document.body.appendChild(link);link.click();link.remove();
                    setTimeout(()=>URL.revokeObjectURL(url),1500);
                    showToast('Label aset 70 × 25 mm berhasil diunduh.','success');
                },'image/png');
            }catch(err){console.error('Label satuan gagal dibuat:',err);showToast('Gagal membuat label: '+(err.message||err),'error');}
        }

        function initSignatures() {
            try {
                ['sig-teknisi', 'sig-user', 'sig-pj'].forEach(id => {
                    const canvas = document.getElementById(id);
                    if(!canvas) return;

                    const parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 300;
                    canvas.width = parentWidth > 50 ? parentWidth : 280;
                    canvas.height = 70;

                    const ctx = canvas.getContext('2d');
                    let isDrawing = false;
                    let activePointerId = null;

                    ctx.lineWidth = 2.5;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.strokeStyle = '#0f172a';

                    // Pointer Events menyatukan mouse + touch + stylus dan
                    // mencegah garis terus tergambar setelah pointer dilepas.
                    canvas.style.touchAction = 'none';

                    function getPos(e) {
                        const r = canvas.getBoundingClientRect();
                        return {
                            x: (e.clientX - r.left) * (canvas.width / r.width),
                            y: (e.clientY - r.top) * (canvas.height / r.height)
                        };
                    }

                    function stopDrawing(e) {
                        if(activePointerId !== null && e && e.pointerId !== activePointerId) return;
                        isDrawing = false;
                        const oldPointerId = activePointerId;
                        activePointerId = null;
                        try {
                            if(e && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
                        } catch(_) {}
                        ctx.beginPath();
                    }

                    function startDrawing(e) {
                        if(currentActiveRole === 'User') return;
                        if(e.pointerType === 'mouse' && e.button !== 0) return;

                        isDrawing = true;
                        activePointerId = e.pointerId;
                        try { canvas.setPointerCapture(e.pointerId); } catch(_) {}

                        const p = getPos(e);
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        if(e.cancelable) e.preventDefault();
                    }

                    function draw(e) {
                        if(currentActiveRole === 'User' || !isDrawing || e.pointerId !== activePointerId) return;
                        if (e.pointerType === 'mouse' && e.buttons === 0) { stopDrawing(e); return; }

                        const p = getPos(e);
                        ctx.lineTo(p.x, p.y);
                        ctx.stroke();
                        if(e.cancelable) e.preventDefault();
                    }

                    // Satu set handler saja; initSignatures() dapat dipanggil
                    // berkali-kali tanpa menumpuk listener.
                    canvas.onpointerdown = startDrawing;
                    canvas.onpointermove = draw;
                    canvas.onpointerup = stopDrawing;
                    canvas.onpointercancel = stopDrawing;
                    canvas.onlostpointercapture = stopDrawing;
                    canvas.onpointerleave = e => { if (e.pointerType === 'mouse' && e.buttons === 0) stopDrawing(e); };
                    canvas._medixStopDrawing = stopDrawing;
                });
            } catch(e) {
                console.warn('Inisialisasi tanda tangan gagal:', e);
            }
        }

        async function hapusBukuPetunjuk(id) {
            if (!izinMenu('riwayat', 'hapus')) { showToast('Anda tidak memiliki izin menghapus buku petunjuk.', 'error'); return; }
            if(currentActiveRole === 'User') return;
            if(await showConfirmDialog("Hapus dokumen buku petunjuk ini?", { title: "Hapus Buku Petunjuk", okText: "Ya, Hapus", icon: "fa-book" })) { db.collection("bukuPetunjukAlat").doc(id).delete().then(() => { showToast("Dokumen berhasil dihapus!", "success"); }); }
        }
        
        function previewDokumenBukuPetunjuk(fileData, fileType, namaFile) {
            const body = document.getElementById('preview-body');
            document.getElementById('preview-title').innerText = "Live Preview: " + namaFile;
            if(fileType.includes('pdf') || fileType.includes('officedocument') || fileType.includes('msword')) {
                body.innerHTML = `<iframe src="${fileData}" class="w-full h-full border rounded-xl" type="${fileType}"></iframe>`;
            } else if(fileType.includes('image')) {
                body.innerHTML = `<div class="max-w-full p-2 flex justify-center"><img src="${fileData}" class="max-h-[70vh] rounded-xl object-contain"></div>`;
            } else {
                body.innerHTML = `<div class="p-6 text-center text-slate-700">File tidak mendukung preview langsung. <a href="${fileData}" download="${namaFile}" class="text-blue-600 underline font-bold block mt-2">Download File Disini</a></div>`;
            }
            toggleModal('modal-preview', true);
        }

        function bukaModalScanQrPublik() {
            document.getElementById('modal-scanner-publik').classList.remove('hidden');
            if (!html5QrCodeScanner) { html5QrCodeScanner = new Html5Qrcode("reader-scanner-div"); }
                html5QrCodeScanner.start(
                    { facingMode: "environment" }, { fps: 15, qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const side = Math.max(180, Math.min(320, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72)));
                        return { width: side, height: side };
                    }, aspectRatio: 1.7777778, disableFlip: false },
                    (decodedText) => {
                        tutupModalScanQrPublik();
                        let targetAlatId = decodedText.trim();
                        try {
                            // Beberapa kamera/browser mengembalikan teks QR sedikit berbeda.
                            // Ambil marker MEDIX langsung terlebih dahulu agar tetap bekerja
                            // walau URL/hash dibungkus atau di-encode oleh scanner.
                            const rawScan=String(decodedText||'').trim();
                            const directAssetMatch=rawScan.match(/(?:#|%23)assetid=([^&\s]+)/i);
                            if(directAssetMatch){
                                bukaKartuPemeliharaanPublik(decodeURIComponent(directAssetMatch[1]));
                                return;
                            }
                            const directPackedMatch=rawScan.match(/(?:#|%23)asset=([^&\s]+)/i);
                            if(directPackedMatch){
                                const packedRaw=decodeURIComponent(directPackedMatch[1]);
                                const payload=medixDecodeBase64Url(packedRaw);
                                if(payload && (payload.id||payload.sn)){
                                    bukaKartuPemeliharaanPublik(payload.id||payload.sn,payload);
                                    return;
                                }
                            }
                            const u=new URL(decodedText,window.location.href);
                            const hash=String(u.hash||'');
                            // QR Rekam Jejak: #assetid=ID (payload paling ringkas dan mudah dipindai).
                            const directId=hash.startsWith('#assetid=')?decodeURIComponent(hash.slice(9)):'';
                            if(directId){
                                bukaKartuPemeliharaanPublik(directId);
                                return;
                            }
                            const packed=hash.startsWith('#asset=')?hash.slice(7):'';
                            const payload=packed?medixDecodeBase64Url(packed):null;
                            if(payload && (payload.id||payload.sn)){
                                bukaKartuPemeliharaanPublik(payload.id||payload.sn,payload);
                                return;
                            }
                            // Legacy QR: ?alat=ID. Tetap didukung untuk label lama.
                            const legacyId=u.searchParams.get('alat');
                            if(legacyId){
                                bukaKartuPemeliharaanPublik(legacyId);
                                return;
                            }
                            // Jika scanner mengembalikan URL dengan #asset tetapi parser URL gagal,
                            // coba decode bagian hash secara langsung.
                            if(hash.startsWith('#assetid=')){
                                const fallbackId=decodeURIComponent(hash.slice(9));
                                if(fallbackId){
                                    bukaKartuPemeliharaanPublik(fallbackId);
                                    return;
                                }
                            }
                            if(hash.startsWith('#asset=')){
                                const fallback=medixDecodeBase64Url(hash.slice(7));
                                if(fallback && (fallback.id||fallback.sn)){
                                    bukaKartuPemeliharaanPublik(fallback.id||fallback.sn,fallback);
                                    return;
                                }
                            }
                            targetAlatId=targetAlatId;
                        } catch(_) {}
                        bukaKartuPemeliharaanPublik(targetAlatId);
                    },
                    (errorMessage) => {}
                ).catch(err => { showToast("Tidak dapat mengakses kamera perangkat.", "error"); });
        }
        
        function tutupModalScanQrPublik() {
            if (html5QrCodeScanner) {
                html5QrCodeScanner.stop().then(() => { document.getElementById('modal-scanner-publik').classList.add('hidden'); }).catch(err => { document.getElementById('modal-scanner-publik').classList.add('hidden'); });
            } else { document.getElementById('modal-scanner-publik').classList.add('hidden'); }
        }
        
        async function bukaKartuPemeliharaanPublik(alatId, embeddedAsset=null) {
            const raw=String(alatId||'').trim();
            if(!raw) return;
            // Semua hasil scan publik diarahkan ke satu halaman Rekam Jejak, bukan dashboard.
            medixAktifkanModeRekamJejakPublik(raw);

            // QR Rekam Jejak dapat berisi URL MEDIX dengan hash #asset=<payload-v3>,
            // QR lama #assetid=<id>, atau URL lama ?alat=<id>. Jangan pernah meneruskan
            // seluruh URL/hash sebagai ID Firestore karena itu menyebabkan "aset tidak ditemukan".
            let clean='';
            let decodedPayload=null;
            try {
                const parsed = new URL(raw, window.location.href);
                const hash = String(parsed.hash || '');
                const queryAlat = parsed.searchParams.get('alat');
                const hashMatch = hash.match(/^#asset=([^&]+)$/i);
                const hashIdMatch = hash.match(/^#assetid=([^&]+)$/i);
                if(hashMatch){
                    decodedPayload = medixDecodeBase64Url(decodeURIComponent(hashMatch[1]));
                    clean = String(decodedPayload?.id || decodedPayload?.sn || '').trim();
                } else if(hashIdMatch){
                    clean = decodeURIComponent(hashIdMatch[1]).trim();
                } else if(queryAlat){
                    clean = String(queryAlat).trim();
                } else if(!parsed.protocol || parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                    clean = raw.replace(/^#assetid=/i,'').replace(/^#asset=/i,'').trim();
                }
            } catch(e) {
                clean = raw.replace(/^#assetid=/i,'').replace(/^#asset=/i,'').replace(/^.*\?alat=/i,'').split('&')[0].trim();
            }
            if(!clean && decodedPayload?.id) clean=String(decodedPayload.id).trim();
            let alat=null;
            try{
                // Payload v3 sudah membawa identitas aset. Gunakan sebagai FAST PATH sehingga
                // scan tidak perlu menunggu listener Master Data atau query Firestore.
                if(decodedPayload && (decodedPayload.id || decodedPayload.sn)) {
                    alat={
                        id:String(decodedPayload.id||''),
                        seri:String(decodedPayload.sn||''),
                        nama:String(decodedPayload.nama||''),
                        merk:String(decodedPayload.merk||''),
                        tipe:String(decodedPayload.tipe||''),
                        ruangan:String(decodedPayload.ruangan||'')
                    };
                }
                if(!alat && embeddedAsset && (embeddedAsset.id||embeddedAsset.sn)) {
                    alat={id:String(embeddedAsset.id||''),seri:String(embeddedAsset.sn||''),nama:String(embeddedAsset.nama||''),merk:String(embeddedAsset.merk||''),tipe:String(embeddedAsset.tipe||''),ruangan:String(embeddedAsset.ruangan||'')};
                }

                // FAST PATH: jika listener Master Data sudah memiliki aset, buka Rekam Jejak
                // segera tanpa menunggu listener/rekap lain selesai.
                if(Array.isArray(dataAlat)){
                    const localAlat=dataAlat.find(a=>String(a.id)===clean||String(a.seri||'')===clean)||null;
                    if(localAlat) alat=localAlat;
                }

                // Jika belum ada di cache lokal, ambil dokumen aset langsung berdasarkan ID QR.
                // Tidak lagi menunggu timer 2.5 detik atau menunggu seluruh dataAlat selesai.
                if(!alat?.id && db){
                    try{
                        const snap=await db.collection('dataAlat').doc(clean).get();
                        if(snap.exists) alat={id:snap.id,...snap.data()};
                    }catch(err){
                        console.warn('Lookup aset langsung berdasarkan ID gagal:',err?.code||err?.message||err);
                    }
                }

                // Fallback nomor seri jika QR berisi SN.
                if(!alat?.id && db){
                    try{
                        const q=await db.collection('dataAlat').where('seri','==',clean).limit(1).get();
                        if(!q.empty){const d=q.docs[0];alat={id:d.id,...d.data()};}
                    }catch(err){
                        console.warn('Lookup aset berdasarkan SN gagal:',err?.code||err?.message||err);
                    }
                }

                // Bila Firestore meminta autentikasi dan auth belum siap, tunggu sekali secara
                // diam-diam lalu ulangi lookup. Tidak ada toast/loading yang menghalangi pengguna.
                if(!alat?.id && !auth.currentUser && auth){
                    await new Promise(resolve=>{
                        let selesai=false;
                        const finish=()=>{if(selesai)return;selesai=true;try{unsub&&unsub()}catch(e){};resolve();};
                        let unsub=null;
                        try{unsub=auth.onAuthStateChanged(()=>finish());}catch(e){finish();}
                        setTimeout(finish,1200);
                    });
                    if(db){
                        try{
                            const snap=await db.collection('dataAlat').doc(clean).get();
                            if(snap.exists) alat={id:snap.id,...snap.data()};
                        }catch(e){}
                    }
                }

                if(!alat){
                    showToast('Aset tidak ditemukan. Pastikan QR/nomor seri masih terdaftar.','error');
                    return;
                }

                // Token publik dapat datang langsung dari QR v4. Jangan menunggu dataAlat
                // atau sesi login untuk menampilkan Rekam Jejak.
                if(decodedPayload?.publicToken) alat.publicToken=decodedPayload.publicToken;
                if(embeddedAsset?.publicToken && !alat.publicToken) alat.publicToken=embeddedAsset.publicToken;

                if(!Array.isArray(dataAlat)) dataAlat=[];
                const existingIndex=dataAlat.findIndex(a=>String(a.id)===String(alat.id));
                if(existingIndex>=0) dataAlat[existingIndex]=alat; else dataAlat.push(alat);

                // Buka Rekam Jejak terlebih dahulu. Projection publik dibaca tanpa login
                // menggunakan token acak dari QR. Jika belum tersedia, fallback ke query
                // internal untuk sesi yang memang sedang login.
                const authGate=document.getElementById('auth-gate-screen');if(authGate)authGate.classList.add('hidden');
                const sidebar=document.getElementById('app-sidebar');if(sidebar)sidebar.style.display='none';
                currentActiveRole='User';
                medixPublicRekamAssetId = String(alat.id || medixPublicRekamAssetId || '').trim();
            document.body.classList.add('medix-public-rekam');
            bukaKartuPemeliharaan(alat.id);
                const modalKartuHeader=document.querySelector('#modal-kartu .bg-slate-100');
                const tombolTutup=modalKartuHeader?.querySelector('button');if(tombolTutup)tombolTutup.style.display='none';

                // Riwayat tidak menghambat pembukaan. Setelah kartu tampil, ambil riwayat
                // aset secara khusus. Jangan hanya mengandalkan listener global karena pada
                // mode scan publik listener bisa belum aktif / belum selesai memuat.
                if(db){
                    const renderPublicRows=async (lkRows,calRows,bukuRows,maintenanceRows)=>{
                        const assetId=String(alat.id);
                        const normalisasiRiwayat=(row)=>({...row,alatId:String(row?.alatId||row?.assetId||row?.idAlat||row?.equipmentId||assetId)});
                        const lkNorm=(lkRows||[]).map(normalisasiRiwayat);
                        const calNorm=(calRows||[]).map(normalisasiRiwayat);
                        const bukuNorm=(bukuRows||[]).map(normalisasiRiwayat);
                        const maintNorm=(maintenanceRows||[]).map(normalisasiRiwayat);
                        if(lkNorm.length){
                            dataLembarKerja=[...(dataLembarKerja||[]).filter(x=>String(x.alatId)!==assetId),...lkNorm];
                            dataPerbaikan=[...(dataPerbaikan||[]).filter(x=>String(x.alatId)!==assetId),...lkNorm.filter(d=>d.jenisKerja==='Corrective Maintenance').map(d=>({...d,desc:d.desc_kerja}))];
                            dataPM=[...(dataPM||[]).filter(x=>String(x.alatId)!==assetId),...lkNorm.filter(d=>d.jenisKerja==='Preventive Maintenance').map(d=>({...d,desc:d.desc_kerja}))];
                            dataInspeksi=[...(dataInspeksi||[]).filter(x=>String(x.alatId)!==assetId),...lkNorm.filter(d=>d.jenisKerja==='Inspection').map(d=>({...d,desc:d.desc_kerja}))];
                        }
                        if(calNorm.length) dataKalibrasi=[...(dataKalibrasi||[]).filter(x=>String(x.alatId)!==assetId),...calNorm];
                        if(bukuNorm.length) dataBukuPetunjuk=[...(dataBukuPetunjuk||[]).filter(x=>String(x.alatId)!==assetId),...bukuNorm];
                        if(maintNorm.length) dataMaintenance=[...(dataMaintenance||[]).filter(x=>String(x.alatId)!==assetId),...maintNorm];
                        if(document.getElementById('modal-kartu') && !document.getElementById('modal-kartu').classList.contains('hidden')){
                            bukaKartuPemeliharaan(alat.id);
                            const header=document.querySelector('#modal-kartu .bg-slate-100');
                            const closeBtn=header?.querySelector('button');if(closeBtn)closeBtn.style.display='none';
                        }
                    };

                    // PRIORITAS 1: projection publik, dapat dibaca tanpa login.
                    if(alat.publicToken){
                        try{
                            const root=db.collection('publicRekamJejak').doc(String(alat.publicToken));
                            const pubSnap=await root.get();
                            if(pubSnap.exists){
                                const [lkSnap,calSnap,bukuSnap,maintSnap]=await Promise.all([
                                    root.collection('lk').get(),root.collection('kalibrasi').get(),root.collection('dokumen').get(),root.collection('maintenance').get()
                                ]);
                                await renderPublicRows(
                                    lkSnap.docs.map(d=>({id:d.id,...d.data()})),
                                    calSnap.docs.map(d=>({id:d.id,...d.data()})),
                                    bukuSnap.docs.map(d=>({id:d.id,...d.data()})),
                                    maintSnap.docs.map(d=>({id:d.id,...d.data()}))
                                );
                                return;
                            }
                        }catch(err){
                            console.warn('Projection publik belum dapat dibaca:',err?.code||err?.message||err);
                        }
                    }

                    // PRIORITAS 2: fallback untuk akun yang memang sedang login.
                    const medixGetByAsset = async (collectionName, asset) => {
                        const ref = db.collection(collectionName);
                        const values = [...new Set([
                            String(asset?.id || '').trim(),
                            asset?.id,
                            String(asset?.seri || '').trim()
                        ].filter(v => v !== undefined && v !== null && String(v) !== ''))];
                        const fields = ['alatId','assetId','idAlat'];
                        const docs = new Map();
                        for(const field of fields){
                            for(const value of values){
                                try{
                                    const snap = await ref.where(field,'==',value).get();
                                    snap.forEach(d => docs.set(d.id,{id:d.id,...d.data()}));
                                }catch(err){
                                    // Beberapa rules/index dapat menolak field alternatif.
                                    // Lanjutkan ke kandidat berikutnya tanpa menghentikan riwayat.
                                }
                            }
                        }
                        return Array.from(docs.values());
                    };

                    Promise.all([
                        medixGetByAsset('lembarKerja', alat),
                        medixGetByAsset('dataKalibrasi', alat),
                        medixGetByAsset('bukuPetunjukAlat', alat),
                        medixGetByAsset('maintenance', alat)
                    ]).then(([lkRows,kalRows,bukuRows,maintenanceRows])=>renderPublicRows(lkRows,kalRows,bukuRows,maintenanceRows))
                      .catch(err=>console.warn('Pemuatan riwayat aset gagal:',err));
                }
            }catch(err){
                console.error('Scan QR langsung gagal:',err);
                showToast('Aset tidak dapat dibuka. Periksa koneksi atau izin database.','error');
            }
        }

        function medixEncodeBase64Url(obj){
            try{
                const bytes=new TextEncoder().encode(JSON.stringify(obj));
                let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b));
                return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
            }catch(e){ return ''; }
        }
        function medixDecodeBase64Url(value){
            try{
                let s=String(value||'').replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='=';
                const bin=atob(s),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
                const raw=JSON.parse(new TextDecoder().decode(bytes));
                if(raw&&Array.isArray(raw.a)){
                    const [id,sn,nama,merk,tipe,ruangan,publicToken]=raw.a;
                    return {v:raw.v||3,id:String(id||''),sn:String(sn||''),nama:String(nama||''),merk:String(merk||''),tipe:String(tipe||''),ruangan:String(ruangan||''),publicToken:String(publicToken||'')};
                }
                return raw;
            }catch(e){ return null; }
        }
        // ============================================================
        // REKAM JEJAK PUBLIK TANPA LOGIN
        // QR publik memakai token acak sebagai bearer-token. Data internal
        // (lembarKerja/dataKalibrasi/maintenance/bukuPetunjukAlat) TIDAK
        // dibuka ke publik; Admin/Teknisi menyalin ringkasan ke koleksi
        // publicRekamJejak/{token}/... yang hanya berisi data yang aman untuk
        // ditampilkan pada halaman scan.
        // ============================================================
        function medixRandomPublicToken(){
            try{
                if(window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g,'');
                if(window.crypto?.getRandomValues){
                    const bytes=new Uint8Array(24); window.crypto.getRandomValues(bytes);
                    let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b));
                    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
                }
            }catch(e){}
            return 'medix-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);
        }

        async function medixEnsurePublicToken(alat, persist=true){
            if(!alat) return '';
            let token=String(alat.publicToken||'').trim();
            if(token) return token;
            token=medixRandomPublicToken();
            alat.publicToken=token;
            if(persist && db && alat.id && ['Admin','Teknisi'].includes(canonicalRole(currentActiveRole))){
                try{
                    await db.collection('dataAlat').doc(String(alat.id)).update({publicToken:token,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
                }catch(err){
                    console.warn('Token publik belum dapat disimpan:',err?.code||err?.message||err);
                    // Token tetap dipakai pada sesi ini; label harus dibuat ulang setelah
                    // penyimpanan berhasil agar QR yang tercetak permanen memakai token.
                }
            }
            return token;
        }

        function medixPublicPick(obj, keys){
            const out={};
            (keys||[]).forEach(k=>{
                if(obj && obj[k]!==undefined && obj[k]!==null) out[k]=obj[k];
            });
            return out;
        }

        async function medixGetRowsForPublic(collectionName, assetId, fields=['alatId','assetId','idAlat']){
            if(!db || !assetId) return [];
            const docs=new Map();
            for(const field of fields){
                try{
                    const snap=await db.collection(collectionName).where(field,'==',String(assetId)).get();
                    snap.forEach(d=>docs.set(d.id,{id:d.id,...d.data()}));
                }catch(e){ /* field/rule/query tidak tersedia; lanjutkan kandidat lain */ }
            }
            return Array.from(docs.values());
        }

        function medixPublicLk(row){
            return {
                id:String(row?.id||''),
                noLk:row?.noLk||'', textTgl:row?.textTgl||row?.tgl||'',
                jenisKerja:row?.jenisKerja||'', desc_kerja:row?.desc_kerja||row?.desc||'',
                hasilTunggal:row?.hasilTunggal||row?.hasil||'',
                teknisiTtd:row?.teknisiTtd||'', saksiTtd:row?.saksiTtd||'', pjTtd:row?.pjTtd||'',
                tglKalibrasi:row?.tglKalibrasi||'', tglExpKalibrasi:row?.tglExpKalibrasi||'',
                bhpUsage:Array.isArray(row?.bhpUsage)?row.bhpUsage.map(u=>({
                    namaItem:u?.namaItem||'',namaAlkes:u?.namaAlkes||'',jenisItem:u?.jenisItem||'',satuan:u?.satuan||'',qty:Number(u?.qty||0)
                })):[]
            };
        }
        function medixPublicCalibration(row){
            return medixPublicPick(row,['id','tgl','exp','vendor','hasil','certFileName','certFileType']);
        }
        function medixPublicMaintenance(row){
            return medixPublicPick(row,['id','equipmentId','kodeAlat','namaAlat','tanggal','jenis','keluhan','tindakan','hasil','teknisi','biaya','vendor','keterangan']);
        }
        function medixPublicDocument(row){
            return medixPublicPick(row,['id','namaFile','fileName','fileType','tglUpload','originalFileName','originalFileType','jenis']);
        }

        async function medixSyncPublicHistoryForAsset(alat, opts={}){
            if(!alat?.id || !db) return false;
            const role=canonicalRole(currentActiveRole);
            if(!['Admin','Teknisi'].includes(role)) return false;
            const token=await medixEnsurePublicToken(alat,true);
            if(!token) return false;
            const root=db.collection('publicRekamJejak').doc(token);
            const stamp=firebase.firestore.FieldValue.serverTimestamp();
            const assetPayload={
                assetId:String(alat.id), nama:alat.nama||'', merk:alat.merk||'', tipe:alat.tipe||'',
                seri:alat.seri||'', ruangan:alat.ruangan||alat.lokasi||'', status:alat.status||'',
                publicToken:token, updatedAt:stamp
            };
            await root.set(assetPayload,{merge:true});

            const [lkRows,calRows,bukuRows,maintenanceRows]=await Promise.all([
                medixGetRowsForPublic('lembarKerja',alat.id),
                medixGetRowsForPublic('dataKalibrasi',alat.id),
                medixGetRowsForPublic('bukuPetunjukAlat',alat.id),
                medixGetRowsForPublic('maintenance',alat.id,['equipmentId','alatId','assetId','idAlat'])
            ]);

            const writeAll=async(col, rows, mapper)=>{
                for(let i=0;i<rows.length;i+=400){
                    const batch=db.batch();
                    rows.slice(i,i+400).forEach(row=>batch.set(root.collection(col).doc(String(row.id)),{...mapper(row),updatedAt:stamp},{merge:true}));
                    await batch.commit();
                }
            };
            await writeAll('lk',lkRows,medixPublicLk);
            await writeAll('kalibrasi',calRows,medixPublicCalibration);
            await writeAll('maintenance',maintenanceRows,medixPublicMaintenance);
            await writeAll('dokumen',bukuRows,medixPublicDocument);
            return true;
        }

        async function medixEnsurePublicTokensForAllAssets(syncHistory=true){
            if(!Array.isArray(dataAlat) || !dataAlat.length) return false;
            if(!db){
                if(dataAlat.every(a=>!!String(a.publicToken||'').trim())) return true;
                showToast('Database belum terhubung; token QR publik belum dapat dipastikan tersimpan.','error'); return false;
            }
            if(!['Admin','Teknisi'].includes(canonicalRole(currentActiveRole))){
                showToast('Sinkronisasi QR publik hanya dapat dilakukan Admin/Teknisi.','error'); return false;
            }
            const btn=document.getElementById('btn-sync-public-qr');
            if(btn){btn.disabled=true;btn.dataset.oldHtml=btn.innerHTML;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-1"></i> Sinkronisasi...';}
            try{
                const tokenOps=[];
                for(const a of dataAlat){
                    if(!a.publicToken) a.publicToken=medixRandomPublicToken();
                    tokenOps.push(a);
                }
                for(let i=0;i<tokenOps.length;i+=450){
                    const batch=db.batch();
                    tokenOps.slice(i,i+450).forEach(a=>batch.set(db.collection('dataAlat').doc(String(a.id)),{publicToken:a.publicToken},{merge:true}));
                    await batch.commit();
                }
                if(syncHistory){
                    let done=0;
                    for(const a of tokenOps){
                        try{await medixSyncPublicHistoryForAsset(a);done++;}catch(e){console.warn('Sinkronisasi publik gagal untuk',a.id,e);}
                    }
                    showToast(`QR publik dan riwayat ${done}/${tokenOps.length} aset berhasil disiapkan. Cetak ulang label agar QR baru aktif tanpa login.`,'success');
                }else showToast(`${tokenOps.length} token QR publik berhasil disiapkan.`,'success');
                return true;
            }catch(err){
                console.error('Sinkronisasi QR publik gagal:',err);
                showToast('Sinkronisasi QR publik gagal: '+(err?.message||err),'error');
                return false;
            }finally{
                if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.oldHtml||'<i class="fa-solid fa-qrcode mr-1.5"></i> Sinkronkan QR Publik';}
            }
        }

        async function medixSyncCurrentAssetPublicHistory(alatId){
            if(!['Admin','Teknisi'].includes(canonicalRole(currentActiveRole))) return;
            const alat=(dataAlat||[]).find(a=>String(a.id)===String(alatId));
            if(!alat) return;
            try{ await medixSyncPublicHistoryForAsset(alat); }
            catch(err){ console.warn('Sinkronisasi Rekam Jejak publik gagal:',err?.code||err?.message||err); }
        }

        function medixBuildQrValue(alat){
            // QR v4 membawa token publik acak. Jika token belum ada, QR tetap kompatibel
            // dengan mode lama; label baru sebaiknya dibuat setelah sinkronisasi token.
            const payload={v:4,a:[String(alat?.id||''),String(alat?.seri||''),String(alat?.nama||''),String(alat?.merk||''),String(alat?.tipe||''),String(alat?.ruangan||alat?.lokasi||''),String(alat?.publicToken||'')]};
            const packed=medixEncodeBase64Url(payload);
            return window.location.origin+window.location.pathname+'#asset='+packed;
        }

        async function downloadLabelBarcodeMassalPdf(){
            if(!izinMenu('master','read')){showToast('Anda tidak memiliki izin melihat Master Data Aset.','error');return;}
            if(!['Admin','Teknisi'].includes(canonicalRole(currentActiveRole))){showToast('Download label tersedia untuk Admin dan Teknisi.','error');return;}
            if(!Array.isArray(dataAlat)||!dataAlat.length){showToast('Data aset medis sedang dimuat atau kosong.','error');return;}
            if(!window.jspdf?.jsPDF){showToast('Mesin PDF belum termuat. Muat ulang halaman lalu coba lagi.','error');return;}
            const tokensReady=await medixEnsurePublicTokensForAllAssets(false);
            if(tokensReady!==true) return;

            // DOWNLOAD LABEL = langsung menghasilkan PDF tanpa preview aplikasi/browser.
            // Ukuran PDF download dibuat tetap A4 landscape; pengaturan kertas printer dilakukan di browser saat CETAK.
            const width=297,height=210,margin=3,labelGap=2;

            const btn=document.getElementById('btn-download-label-master');
            if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.setAttribute('aria-busy','true');}
            try{
                await medixGenerateLabelPdf({width,height,margin,labelGap});
            }catch(err){
                console.error('Download label gagal:',err);
                showToast('Download label gagal: '+(err.message||err),'error');
            }finally{
                if(btn){btn.disabled=false;btn.removeAttribute('aria-busy');btn.innerHTML=btn.dataset.originalText||'<i class="fa-solid fa-download mr-1.5"></i> Download Label';}
            }
        }

        const medixQrCache = new Map();
        let medixQrEngineHost = null;
        let medixQrEngine = null;
        let medixQrEngineSize = 0;
        let medixQrWarmTimer = null;

        function medixEnsureQrEngine(size=82){
            if (!window.QRCode) throw new Error('Mesin QR Code belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
            if (!medixQrEngineHost) {
                medixQrEngineHost = document.createElement('div');
                medixQrEngineHost.setAttribute('aria-hidden','true');
                medixQrEngineHost.style.cssText='position:fixed;left:-100000px;top:-100000px;width:1px;height:1px;background:#fff;overflow:hidden;opacity:0;pointer-events:none;';
                document.body.appendChild(medixQrEngineHost);
            }
            medixQrEngineHost.style.width=size+'px';
            medixQrEngineHost.style.height=size+'px';
            if (!medixQrEngine || medixQrEngineSize !== size) {
                medixQrEngineHost.innerHTML='';
                medixQrEngine = new QRCode(medixQrEngineHost,{text:'MEDIX',width:size,height:size,colorDark:'#000000',colorLight:'#ffffff',correctLevel:(QRCode.CorrectLevel&&QRCode.CorrectLevel.L)||0});
                medixQrEngineSize = size;
            }
            return medixQrEngineHost;
        }

        function medixGetQrDataUrl(value,size=82){
            const key=String(value||'MEDIX');
            const cacheKey=key+'|'+size;
            if(medixQrCache.has(cacheKey)) return medixQrCache.get(cacheKey);
            const host=medixEnsureQrEngine(size);
            try {
                if(typeof medixQrEngine.makeCode==='function') medixQrEngine.makeCode(key);
                else { host.innerHTML=''; medixQrEngine=new QRCode(host,{text:key,width:size,height:size,colorDark:'#000000',colorLight:'#ffffff',correctLevel:(QRCode.CorrectLevel&&QRCode.CorrectLevel.L)||0}); }
                const canvas=host.querySelector('canvas');
                if(canvas){const url=canvas.toDataURL('image/png');medixQrCache.set(cacheKey,url);return url;}
                const img=host.querySelector('img');
                if(img && img.src){medixQrCache.set(cacheKey,img.src);return img.src;}
                throw new Error('QR Code tidak menghasilkan gambar.');
            } catch(e){
                // Jika engine reusable gagal pada browser tertentu, fallback satu instance.
                host.innerHTML='';
                medixQrEngine=new QRCode(host,{text:key,width:size,height:size,colorDark:'#000000',colorLight:'#ffffff',correctLevel:(QRCode.CorrectLevel&&QRCode.CorrectLevel.L)||0});
                medixQrEngineSize=size;
                const canvas=host.querySelector('canvas');
                if(canvas){const url=canvas.toDataURL('image/png');medixQrCache.set(cacheKey,url);return url;}
                const img=host.querySelector('img');
                if(img?.src){medixQrCache.set(cacheKey,img.src);return img.src;}
                throw e;
            }
        }

        function medixWarmQrCache(){
            if(!Array.isArray(dataAlat)||!dataAlat.length||!window.QRCode)return;
            if(medixQrWarmTimer) return;
            let index=0;
            const run=deadline=>{
                medixQrWarmTimer=null;
                const start=performance.now();
                let count=0;
                while(index<dataAlat.length && count<6 && performance.now()-start<8){
                    const a=dataAlat[index++];
                    try{medixGetQrDataUrl(medixBuildQrValue(a),110);}catch(e){}
                    count++;
                }
                if(index<dataAlat.length){
                    const next=()=>medixWarmQrCache();
                    if('requestIdleCallback' in window) medixQrWarmTimer=requestIdleCallback(run,{timeout:200});
                    else medixQrWarmTimer=setTimeout(next,16);
                }
            };
            if('requestIdleCallback' in window) medixQrWarmTimer=requestIdleCallback(run,{timeout:300});
            else medixQrWarmTimer=setTimeout(()=>run({timeRemaining:()=>8}),16);
        }


        async function medixGenerateLabelPdf(settings){
            if(!Array.isArray(dataAlat)||!dataAlat.length) throw new Error('Data aset medis kosong.');
            if(!window.jspdf?.jsPDF) throw new Error('Mesin PDF belum termuat.');
            if(!window.QRCode) throw new Error('Mesin QR Code belum termuat.');
            const {jsPDF}=window.jspdf;
            const pageW=297,pageH=210,margin=5,gap=2,labelW=70,labelH=25;
            const cols=4,rows=7,perPage=cols*rows;
            const contentW=cols*labelW+(cols-1)*gap,contentH=rows*labelH+(rows-1)*gap;
            const ox=(pageW-contentW)/2,oy=(pageH-contentH)/2;
            const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
            const esc=v=>String(v??'-').replace(/[<>]/g,'');
            let logo='';try{logo=await medixGetLabelLogoDataUrl();}catch(e){console.warn('Logo label PDF tidak tersedia; identitas teks tetap digunakan.',e);}
            const fit=(text,x,y,w,size,color,style='bold')=>{
                pdf.setFont('helvetica',style);pdf.setFontSize(size);pdf.setTextColor(...color);
                const lines=pdf.splitTextToSize(esc(text||'-'),w).slice(0,1);
                pdf.text(lines,x,y);
            };
            for(let idx=0;idx<dataAlat.length;idx++){
                if(idx&&idx%perPage===0) pdf.addPage('a4','landscape');
                const pos=idx%perPage,col=pos%cols,row=Math.floor(pos/cols),x=ox+col*(labelW+gap),y=oy+row*(labelH+gap),a=dataAlat[idx]||{};
                pdf.setFillColor(255,255,255);pdf.setDrawColor(18,48,71);pdf.setLineWidth(.25);pdf.roundedRect(x,y,labelW,labelH,1.2,1.2,'FD');
                if(logo) pdf.addImage(logo,'PNG',x+1.2,y+.45,3.3,3.3);
                pdf.setFont('helvetica','bold');pdf.setFontSize(6.1);pdf.setTextColor(15,118,110);pdf.text('MEDIX',x+5.2,y+2.6);
                pdf.setFontSize(3.55);pdf.setTextColor(18,48,71);pdf.text('UPTD RSUD KELAS D PONDOKGEDE',x+16.7,y+2.35);
                pdf.setFontSize(2.8);pdf.setTextColor(100,116,139);pdf.text('IDENTITAS ASET KESEHATAN',x+16.7,y+3.65);
                pdf.setDrawColor(219,229,235);pdf.setLineWidth(.18);pdf.line(x+1,y+4.4,x+labelW-1,y+4.4);
                const qr=medixGetQrDataUrl(medixBuildQrValue(a),512);
                // Tambahkan quiet zone putih dengan menempatkan QR di tengah kotak 18 mm.
                pdf.setFillColor(255,255,255);pdf.rect(x+1.5,y+5.1,18,18,'F');
                pdf.addImage(qr,'PNG',x+3,y+6.6,15,15);
                const tx=x+21.5,tw=47;
                fit(a.nama||a.namaAlat||'ALAT KESEHATAN',tx,y+9.0,tw,7.0,[18,48,71]);
                fit([a.merk,a.tipe].filter(Boolean).join(' · ')||'Merk / tipe tidak dicantumkan',tx,y+13.0,tw,5.0,[71,85,105]);
                const kode=a.kodeAlat||a.kodeAset||a.kode||a.assetCode||a.nomorAset||a.id||'-';
                fit(`ID ${kode}  |  SN ${a.seri||a.serialNumber||'-'}`,tx,y+16.7,tw,4.4,[51,65,85],'normal');
                fit(`LOKASI ${a.ruangan||a.lokasi||'-'}`,tx,y+20.5,tw,4.5,[15,118,110]);
                pdf.setFont('helvetica','bold');pdf.setFontSize(3.0);pdf.setTextColor(100,116,139);
                pdf.text('SCAN UNTUK REKAM JEJAK ASET',x+labelW/2,y+24.1,{align:'center'});
            }
            const blob=pdf.output('blob'),url=URL.createObjectURL(blob),link=document.createElement('a');
            link.href=url;link.download=`MEDIX_Smart_Asset_Tag_${new Date().toISOString().slice(0,10)}.pdf`;link.style.display='none';
            document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
            showToast(`${dataAlat.length} label MEDIX 70 × 25 mm berhasil diunduh.`,'success');
        }

        async function cetakLabelBarcodeMassalPdf() {
            if (!izinMenu('master', 'read')) { showToast('Anda tidak memiliki izin melihat Master Data Aset.', 'error'); return; }
            if (!['Admin','Teknisi'].includes(canonicalRole(currentActiveRole))) { showToast('Cetak label hanya tersedia untuk Admin dan Teknisi.', 'error'); return; }
            if (!Array.isArray(dataAlat) || !dataAlat.length) { showToast('Data aset medis sedang dimuat atau kosong.', 'error'); return; }
            const tokensReady=await medixEnsurePublicTokensForAllAssets(false);
            if(tokensReady!==true) return;
            await medixPrintLabelsBrowser();
        }

        async function medixPrintLabelsBrowser() {
            const old=document.getElementById('medix-label-print-root');if(old)old.remove();
            const root=document.createElement('div');root.id='medix-label-print-root';
            const esc=v=>String(v??'-').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
            const perPage=28,logoUrl=new URL('assets/images/logo.png',document.baseURI).href;
            for(let start=0;start<dataAlat.length;start+=perPage){
                const pageItems=dataAlat.slice(start,start+perPage),page=document.createElement('div');
                page.className='medix-label-print-page';
                page.innerHTML=pageItems.map((a,i)=>{
                    const kode=a.kodeAlat||a.kodeAset||a.kode||a.assetCode||a.nomorAset||a.id||'-';
                    return `<div class="medix-label-card-print">
                      <div class="medix-label-top"><img src="${logoUrl}" alt="Logo RSUD" onerror="this.style.display='none'"><b>MEDIX</b><span>UPTD RSUD KELAS D PONDOKGEDE</span></div>
                      <div class="medix-label-body"><div class="medix-label-qr" id="medix-browser-qr-${start+i}"></div><div class="medix-label-info">
                        <div class="medix-label-name">${esc(a.nama||a.namaAlat||'ALAT KESEHATAN')}</div>
                        <div class="medix-label-sub">${esc([a.merk,a.tipe].filter(Boolean).join(' · ')||'Merk / tipe tidak dicantumkan')}</div>
                        <div class="medix-label-sn">ID ${esc(kode)} &nbsp;|&nbsp; SN ${esc(a.seri||a.serialNumber||'-')}</div>
                        <div class="medix-label-room">LOKASI ${esc(a.ruangan||a.lokasi||'-')}</div>
                      </div></div>
                      <div class="medix-label-scan">SCAN UNTUK REKAM JEJAK ASET</div>
                    </div>`;
                }).join('');
                root.appendChild(page);
            }
            document.body.appendChild(root);document.body.classList.add('medix-label-printing');
            try{
                for(let i=0;i<dataAlat.length;i++){
                    const a=dataAlat[i]||{},host=document.getElementById(`medix-browser-qr-${i}`);if(!host)continue;
                    const img=document.createElement('img');img.src=medixGetQrDataUrl(medixBuildQrValue(a),512);img.alt='QR Rekam Jejak Aset';
                    img.width=420;img.height=420;host.appendChild(img);
                }
                await Promise.all(Array.from(root.querySelectorAll('img')).map(img=>img.decode?img.decode().catch(()=>{}):new Promise(resolve=>{if(img.complete)return resolve();img.onload=resolve;img.onerror=resolve;})));
                await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
                const cleanup=()=>{document.body.classList.remove('medix-label-printing');root.remove();document.body.classList.remove('medix-modal-open');};
                window.addEventListener('afterprint',cleanup,{once:true});
                window.focus();window.print();setTimeout(cleanup,15000);
            }catch(err){document.body.classList.remove('medix-label-printing');root.remove();throw err;}
        }

        function mundurKeMenuSebelumnya() {
            const modalKartu = document.getElementById('modal-kartu');
            const areaLk = document.getElementById('area-lembar-kerja-resmi');
            const modalPreview = document.getElementById('modal-preview');
            const modalAlat = document.getElementById('modal-alat');
            const modalKalibrasi = document.getElementById('modal-kalibrasi');
            const modalScanner = document.getElementById('modal-scanner-publik');
    
            if (modalScanner && !modalScanner.classList.contains('hidden')) { tutupModalScanQrPublik(); return; }
            if (modalPreview && !modalPreview.classList.contains('hidden')) { toggleModal('modal-preview', false); return; }
            if (modalKartu && !modalKartu.classList.contains('hidden')) { toggleModal('modal-kartu', false); return; }
            if (areaLk && !areaLk.classList.contains('hidden')) { areaLk.classList.add('hidden'); return; }
            if (modalAlat && !modalAlat.classList.contains('hidden')) { toggleModal('modal-alat', false); return; }
            if (modalKalibrasi && !modalKalibrasi.classList.contains('hidden')) { toggleModal('modal-kalibrasi', false); return; }
    
            if (riwayatNavigasiTab.length > 1) {
                riwayatNavigasiTab.pop(); 
                let tabSebelumnya = riwayatNavigasiTab[riwayatNavigasiTab.length - 1];
                switchTab(tabSebelumnya);
            }
        }
    
        document.addEventListener('keydown', function(event) {
            const isTyping = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable;
            if (!isTyping) {
                if (event.key === 'Escape' || event.key === 'Backspace' || (event.altKey && event.key === 'ArrowLeft')) {
                    event.preventDefault();
                    mundurKeMenuSebelumnya();
                }
            }
        });
    
        window.history.pushState({ page: 'main' }, '', '');
        window.addEventListener('popstate', function(event) {
            if (medixPublicRekamMode) {
                // Dari URL QR, Back tidak boleh membuka dashboard. Tetap di halaman Rekam Jejak.
                try { window.history.pushState({ page:'rekam-jejak-public', assetId:medixPublicRekamAssetId }, '', window.location.href); } catch(e) {}
                const modalKartu=document.getElementById('modal-kartu');
                if (modalKartu && modalKartu.classList.contains('hidden') && medixPublicRekamAssetId) {
                    bukaKartuPemeliharaan(medixPublicRekamAssetId);
                }
                return;
            }
            window.history.pushState({ page: 'main' }, '', '');
            mundurKeMenuSebelumnya();
        });
    
        window.addEventListener('DOMContentLoaded', () => {
            syncMasterHeaderActions();
            setTimeout(syncMasterHeaderActions, 100);
            setTimeout(syncMasterHeaderActions, 300);
        }, { once: true });

        window.onload = function() { 
             syncMasterHeaderActions();
             renderOpsiDropdownAwal(); 
             gantiSubTabDokumen('all'); 
             setTimeout(() => {
                 renderGrafikDashboardDinamis();
                 renderGrafikTrenKerusakan();
             }, 100); 
             const urlParams = new URLSearchParams(window.location.search);
             const scanAlatId = urlParams.get('alat');
             const packedAsset = window.location.hash.startsWith('#asset=') ? medixDecodeBase64Url(window.location.hash.slice(7)) : null;
             if (packedAsset && (packedAsset.id || packedAsset.sn)) {
                 medixAktifkanModeRekamJejakPublik(packedAsset.id || packedAsset.sn);
                 bukaKartuPemeliharaanPublik(packedAsset.id || packedAsset.sn, packedAsset);
             } else if (scanAlatId && scanAlatId.trim() !== "") {
                 medixAktifkanModeRekamJejakPublik(scanAlatId);
                 bukaKartuPemeliharaanPublik(scanAlatId);
             }
        };

        function ubahTampilanFormUpload(kategori) {
            const secKalibrasi = document.getElementById('form-section-kalibrasi-Only');
            const secKet = document.getElementById('form-section-keterangan-Only');
            const labelKet = document.getElementById('label-keterangan-teks');
            if (kategori === 'sop') {
                if(secKalibrasi) secKalibrasi.classList.add('hidden');
                if(secKet) secKet.classList.remove('hidden');
                if(labelKet) labelKet.innerText = "Judul / Keterangan SOP *";
            } else if (kategori === 'mandiri') {
                if(secKalibrasi) secKalibrasi.classList.add('hidden');
                if(secKet) secKet.classList.remove('hidden');
                if(labelKet) labelKet.innerText = "Nomor / Keterangan Lembar Kerja (LK) *";
            } else {
                if(secKalibrasi) secKalibrasi.classList.remove('hidden');
                if(secKet) secKet.classList.add('hidden');
            }
        }
        
        function hitungOtomatisMasaBerlakuKalibrasi(tglUjiValue) {
            if(!tglUjiValue) return;
            let tglUji = new Date(tglUjiValue);
            tglUji.setFullYear(tglUji.getFullYear() + 1);
            let tglExpFormatted = tglUji.toISOString().substring(0, 10);
            const inputExp = document.getElementById('form-cal-exp');
            if(inputExp) inputExp.value = tglExpFormatted;
        }

        function showDropdownKalibrasiAlat() {
            const container = document.getElementById('dropdown-pilih-alat-kalibrasi');
            if(container) { populasikanListAlatKalibrasiModal(document.getElementById('input-search-alat-kalibrasi').value); container.style.display = "block"; }
        }

        function handleSearchKalibrasiAlat(kw) {
            populasikanListAlatKalibrasiModal(kw);
            const container = document.getElementById('dropdown-pilih-alat-kalibrasi');
            if(container) container.style.display = "block";
        }
        
        function populasikanListAlatKalibrasiModal(keyword = "") {
            const container = document.getElementById('dropdown-pilih-alat-kalibrasi');
            if(!container) return;
            const kw = keyword.toLowerCase();
            const filtered = dataAlat.filter(a => `${a.nama || ''} ${a.seri || ''} ${a.ruangan || a.lokasi || ''}`.toLowerCase().includes(kw));
            if(filtered.length === 0) { container.innerHTML = `<div class="p-2.5 text-slate-400 italic text-center">Alat tidak ditemukan</div>`; return; }
            container.innerHTML = filtered.map(a => `
                <div onclick="pilihAlatKalibrasiModalFinal('${a.id}')" class="p-2.5 hover:bg-blue-50 cursor-pointer border-b border-slate-100 truncate">
                    📌 <b>${a.nama}</b> | SN: <span class="font-mono text-cyan-600">${a.seri || '-'}</span> (${a.ruangan || a.lokasi || 'Unit'})
                </div>
            `).join('');
        }
        
        function pilihAlatKalibrasiModalFinal(alatId) {
            const alat = dataAlat.find(a => a.id == alatId);
            if(alat) {
                document.getElementById('form-cal-alat-id').value = alat.id;
                document.getElementById('input-search-alat-kalibrasi').value = `${alat.nama} (SN: ${alat.seri || '-'}) - [${alat.ruangan || alat.lokasi || 'Unit'}]`;
            }
            const container = document.getElementById('dropdown-pilih-alat-kalibrasi');
            if(container) container.style.display = "none";
        }
    
        function bacaFileSebagaiDataURL(fileOrBlob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('File tidak dapat dibaca oleh browser.'));
                reader.onabort = () => reject(new Error('Pembacaan file dibatalkan.'));
                reader.readAsDataURL(fileOrBlob);
            });
        }

        function blobKeDataURL(blob) {
            return bacaFileSebagaiDataURL(blob);
        }

        async function kompresGambarOtomatis(file) {
            const imageUrl = await bacaFileSebagaiDataURL(file);
            const img = new Image();
            img.decoding = 'async';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Gambar tidak dapat diproses untuk kompresi otomatis.'));
                img.src = imageUrl;
            });

            const MAX_W = 1400;
            const MAX_H = 1400;
            const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
            const width = Math.max(1, Math.round(img.naturalWidth * scale));
            const height = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // Turunkan kualitas bertahap sampai ukuran aman untuk Firestore.
            const qualities = [0.72, 0.62, 0.52, 0.42, 0.34, 0.28];
            let bestBlob = null;
            for (const quality of qualities) {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
                if (!blob) continue;
                bestBlob = blob;
                if (blob.size <= 480 * 1024) break;
            }
            if (!bestBlob) throw new Error('Browser tidak dapat membuat hasil kompresi gambar.');
            return {
                blob: bestBlob,
                mimeType: 'image/jpeg',
                originalSize: file.size,
                compressedSize: bestBlob.size,
                mode: 'image-jpeg'
            };
        }

        async function kompresPdfOtomatis(file) {
            // PDF sertifikat dipadatkan di perangkat. Jika library PDF belum
            // termuat, file kecil tetap boleh disimpan apa adanya.
            const MAX_STORED_BYTES = 680 * 1024;
            if (!window.pdfjsLib || !window.jspdf?.jsPDF) {
                if (file.size <= MAX_STORED_BYTES) {
                    return { blob: file, mimeType: 'application/pdf', originalSize: file.size, compressedSize: file.size, mode: 'pdf-original-fallback' };
                }
                throw new Error('Mesin kompresi PDF belum termuat. Muat ulang halaman lalu coba lagi.');
            }
            if (window.pdfjsLib.GlobalWorkerOptions) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }

            const buffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
            const { jsPDF } = window.jspdf;

            async function renderUlang(scaleLimit, jpgQuality) {
                let outPdf = null;
                for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
                    const page = await pdf.getPage(pageNo);
                    const baseViewport = page.getViewport({ scale: 1 });
                    const renderScale = Math.min(scaleLimit, 1200 / Math.max(baseViewport.width, baseViewport.height));
                    const viewport = page.getViewport({ scale: Math.max(0.72, renderScale) });
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.ceil(viewport.width);
                    canvas.height = Math.ceil(viewport.height);
                    const ctx = canvas.getContext('2d', { alpha: false });
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    await page.render({ canvasContext: ctx, viewport }).promise;

                    const jpg = canvas.toDataURL('image/jpeg', jpgQuality);
                    const pageW = viewport.width * 72 / 96;
                    const pageH = viewport.height * 72 / 96;
                    const orientation = pageW >= pageH ? 'landscape' : 'portrait';

                    if (!outPdf) {
                        outPdf = new jsPDF({ orientation, unit: 'pt', format: [pageW, pageH], compress: true, putOnlyUsedFonts: true });
                    } else {
                        outPdf.addPage([pageW, pageH], orientation);
                    }
                    outPdf.addImage(jpg, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
                    canvas.width = 1;
                    canvas.height = 1;
                }
                return outPdf.output('blob');
            }

            // Pass pertama menjaga keterbacaan; pass kedua lebih agresif jika masih besar.
            let blob = await renderUlang(1.35, 0.52);
            if (blob.size > 560 * 1024) blob = await renderUlang(1.05, 0.38);
            if (blob.size > MAX_STORED_BYTES) blob = await renderUlang(0.85, 0.30);

            return {
                blob,
                mimeType: 'application/pdf',
                originalSize: file.size,
                compressedSize: blob.size,
                mode: 'pdf-raster-jpeg'
            };
        }

        async function optimalkanBerkasUpload(file) {
            const type = String(file.type || '').toLowerCase();
            if (type.startsWith('image/')) return await kompresGambarOtomatis(file);
            if (type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return await kompresPdfOtomatis(file);
            // Format lain tidak didukung oleh form, tetapi tetap disimpan bila kecil.
            return { blob: file, mimeType: type || 'application/octet-stream', originalSize: file.size, compressedSize: file.size, mode: 'original' };
        }

        async function bukaDokumenPusat(docId, koleksi, fileType, judul) {
            try {
                const snap = await db.collection(koleksi).doc(docId).get();
                if (!snap.exists) return showToast('Dokumen tidak ditemukan.', 'error');
                const d = snap.data() || {};
                const fileData = d.certPdf || d.fileData || d.fotoAlat || '';
                if (!fileData) return showToast('Isi berkas tidak tersedia pada dokumen ini.', 'error');
                if (String(fileType || '').includes('pdf')) {
                    lihatFileLangsung(fileData, 'pdf', judul || 'Dokumen');
                } else {
                    previewDokumenBukuPetunjuk(fileData, fileType || d.fileType || 'image/jpeg', judul || d.fileName || 'Dokumen');
                }
            } catch (err) {
                console.error('Buka dokumen gagal:', err);
                showToast('Dokumen gagal dibuka. Periksa koneksi Firestore.', 'error');
            }
        }

        async function submitUploadBerkasUniversal(e) {
            e.preventDefault();
            if (!(['Admin','Teknisi'].includes(canonicalRole(currentActiveRole)) || izinMenu('riwayat', 'upload')) || currentActiveRole === 'User') {
                return showToast('Akses upload dokumen hanya tersedia untuk Admin/Teknisi.', 'error');
            }

            const form = e.currentTarget;
            const submitBtn = form?.querySelector('button[type="submit"]');
            const alatId = document.getElementById('form-cal-alat-id')?.value || '';
            const jenisKategori = document.getElementById('form-upload-jenis-kategori')?.value || 'kalibrasi';
            const file = document.getElementById('form-cal-pdf-file')?.files?.[0];

            if (!alatId) return showToast('Pilih instrumen alat medis terlebih dahulu!', 'error');
            if (!file) return showToast('Pilih file berkas yang akan disimpan!', 'error');
            if (jenisKategori === 'kalibrasi') {
                const tgl = document.getElementById('form-cal-tgl')?.value || '';
                const exp = document.getElementById('form-cal-exp')?.value || '';
                if (!tgl || !exp) return showToast('Tanggal uji dan masa berlaku sertifikat wajib diisi.', 'error');
            } else if (!(document.getElementById('form-keterangan-namafile')?.value || '').trim()) {
                return showToast('Nama/keterangan dokumen wajib diisi.', 'error');
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.dataset.oldHtml = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-compress mr-1"></i>Mengompres & menyimpan...';
            }

            try {
                const optimized = await Promise.race([
                    optimalkanBerkasUpload(file),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Proses kompresi melebihi batas waktu 90 detik. Coba file yang lebih sederhana.')), 90000))
                ]);

                // Target aman untuk Base64 + metadata di satu dokumen Firestore.
                const MAX_STORED_BYTES = 680 * 1024;
                if (optimized.compressedSize > MAX_STORED_BYTES) {
                    throw new Error(`Setelah kompresi otomatis ukuran masih ${Math.round(optimized.compressedSize / 1024)} KB. Coba pilih file/PDF yang lebih sederhana agar dapat disimpan langsung ke database.`);
                }

                const fileDataUrl = await Promise.race([
                    blobKeDataURL(optimized.blob),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Pembacaan hasil kompresi melebihi batas waktu 30 detik.')), 30000))
                ]);
                if (!fileDataUrl) throw new Error('Hasil kompresi kosong atau tidak dapat dibaca.');

                let targetCollection = '', payload = {};
                const commonFileMeta = {
                    originalFileName: file.name,
                    originalFileType: file.type || optimized.mimeType,
                    originalFileSize: file.size,
                    storedFileSize: optimized.compressedSize,
                    compressionMode: optimized.mode,
                    compressedAt: new Date().toISOString()
                };

                if (jenisKategori === 'kalibrasi') {
                    targetCollection = 'dataKalibrasi';
                    payload = {
                        alatId,
                        tgl: document.getElementById('form-cal-tgl').value,
                        exp: document.getElementById('form-cal-exp').value,
                        vendor: document.getElementById('form-cal-vendor').value.trim() || 'Eksternal / Vendor',
                        certPdf: fileDataUrl,
                        certFileName: file.name,
                        certFileType: optimized.mimeType,
                        certFileSize: optimized.compressedSize,
                        storageType: 'firestore-inline-compressed',
                        storagePath: '',
                        hasil: document.getElementById('form-cal-hasil').value,
                        ...commonFileMeta,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                } else if (jenisKategori === 'sop') {
                    targetCollection = 'bukuPetunjukAlat';
                    payload = {
                        alatId,
                        namaFile: document.getElementById('form-keterangan-namafile').value.trim() || file.name,
                        fileType: optimized.mimeType,
                        fileData: fileDataUrl,
                        fileName: file.name,
                        fileSize: optimized.compressedSize,
                        storageType: 'firestore-inline-compressed',
                        storagePath: '',
                        ...commonFileMeta,
                        tglUpload: new Date().toISOString().substring(0, 10),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                } else {
                    targetCollection = 'lembarKerja';
                    payload = {
                        alatId,
                        noLk: document.getElementById('form-keterangan-namafile').value.trim(),
                        textTgl: new Date().toISOString().substring(0, 10),
                        jenisKerja: 'Dokumen Lembar Kerja (LK)',
                        desc_kerja: 'Dokumen Lembar Kerja (LK) diunggah manual.',
                        hasilTunggal: 'Alat Berfungsi Dengan Baik',
                        fileData: fileDataUrl,
                        fileType: optimized.mimeType,
                        fileName: file.name,
                        fileSize: optimized.compressedSize,
                        storageType: 'firestore-inline-compressed',
                        storagePath: '',
                        ...commonFileMeta,
                        fotoAlat: '-',
                        isLocked: true,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                }

                await Promise.race([
                    db.collection(targetCollection).add(payload),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Penyimpanan Firestore melebihi batas waktu 30 detik. Periksa Firestore Rules/koneksi.')), 30000))
                ]);
                medixSyncCurrentAssetPublicHistory(alatId);

                form.reset();
                document.getElementById('form-cal-alat-id').value = '';
                document.getElementById('input-search-alat-kalibrasi').value = '';
                ubahTampilanFormUpload('kalibrasi');
                toggleModal('modal-kalibrasi', false);
                renderTabelPusatDokumen();
                showToast(`Berkas berhasil dikompres (${Math.round(file.size / 1024)} KB → ${Math.round(optimized.compressedSize / 1024)} KB) dan disimpan.`, 'success');
            } catch (error) {
                console.error('Simpan dokumen gagal:', error);
                let msg = error?.message || 'Terjadi kesalahan saat menyimpan dokumen.';
                const code = String(error?.code || '');
                if (code === 'permission-denied') {
                    msg = 'Akses Firestore ditolak. Pastikan akun Admin/Teknisi aktif dan Security Rules mengizinkan penyimpanan.';
                } else if (code === 'resource-exhausted') {
                    msg = 'Dokumen masih terlalu besar setelah kompresi otomatis. Gunakan file sumber yang lebih ringan.';
                }
                showToast('Gagal menyimpan berkas: ' + msg, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.oldHtml || 'Simpan';
                }
            }
        }
