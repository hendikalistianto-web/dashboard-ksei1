// @ts-nocheck
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, Building2, User, Users, 
  Activity, ArrowUpRight, ArrowDownRight, 
  PieChart, FileUp, CheckCircle2, ShieldAlert, Layers, Filter, Network,
  ZoomIn, ZoomOut, Maximize, Globe, MapPin, Flag
} from 'lucide-react';

// --- DATABASE VERIFIKASI GOOGLE SEARCH (DIREKSI/FOUNDER) ---
const KNOWN_FOUNDERS = [
  "PRAJOGO PANGESTU", "ANTHONI SALIM", "ROBERT BUDI HARTONO", "MICHAEL BAMBANG HARTONO",
  "LOW TUCK KWONG", "GARIBALDI THOHIR", "SUSILO WONOWIDJOJO", "CHAIRUL TANJUNG",
  "EDWIN SOERYADJAYA", "THEODORE PERMADI RACHMAT", "DJOKO SUSANTO", "HERMANTO TANOKO",
  "SUKANTO TANOTO", "MARTUA SITORUS", "PETER SONDAKH", "MOCHTAR RIADY", "PUTERA SAMPOERNA",
  "CIPUTRA", "HARY TANOESOEDIBJO", "SUDONO SALIM", "EKA TJIPTA WIDJAJA", "WILLIAM SOERYADJAYA",
  "JOGI HENDRA ATMADJA", "KIKI BARKI", "EDDY KUSNADI SARIAATMADJA", "HUSAIN DJOJONEGORO",
  "ALEXANDER RAMLIE", "AGUS LASMONO", "HARYANTO ADIKOESOEMO", "SABANA PRAWIRAWIDJAJA",
  "BAMBANG TRIHATMODJO", "ANTHONY SALIM", "DATUK LOW TUCK KWONG", "JERRY NG", 
  "PATRICK WALUJO", "BOENJAMIN SETIAWAN", "TAHIR", "CILIANDRA FANGIONO"
];

const CATEGORY_NAMES = {
  'CP': 'Corporate', 'IB': 'Bank', 'FD': 'Foundation', 'OT': 'Other',
  'ID': 'Individual', 'MF': 'Mutual Fund', 'IS': 'Insurance', 
  'PF': 'Pension', 'SC': 'Securities'
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

const CAT_COLOR_MAP = {
  'CP': 'bg-blue-500', 'IB': 'bg-indigo-500', 'FD': 'bg-pink-500', 'OT': 'bg-slate-500',
  'ID': 'bg-amber-500', 'MF': 'bg-emerald-500', 'IS': 'bg-teal-500', 'PF': 'bg-cyan-500',
  'SC': 'bg-purple-500'
};

// --- REGEX CACHING ---
const REGEX_MF = /(REKSA DANA|REKSADANA|MUTUAL FUND|UNIT TRUST|ASSET MANAGEMENT)/;
const REGEX_IS = /(ASURANSI|INSURANCE|LIFE|ASSURANCE)/;
const REGEX_PF = /(DANA PENSIUN|PENSION|BPJS|TASPEN|JAMSOSTEK|ASABRI)/;
const REGEX_IB = /(BANK|BPD|BUT )/;
const REGEX_SC = /(SEKURITAS|SECURITIES|BROKER)/;
const REGEX_FD = /(YAYASAN|FOUNDATION)/;
const REGEX_OT = /(REPUBLIK|NEGARA|GOVERNMENT|MINISTRY|KEMENTERIAN)/;
const REGEX_CP = /(PT\.|PT |LTD|LIMITED|CORP|INC\.|TBK|B\.V\.|PTE|HOLDING|INVESTMENT|GROUP|NV |S\.A\.|LLC)/;

function getCategoryFallback(investor) {
  const inv = (investor || "").toUpperCase();
  if (REGEX_MF.test(inv)) return 'MF';
  if (REGEX_IS.test(inv)) return 'IS';
  if (REGEX_PF.test(inv)) return 'PF';
  if (REGEX_IB.test(inv)) return 'IB';
  if (REGEX_SC.test(inv)) return 'SC';
  if (REGEX_FD.test(inv)) return 'FD';
  if (REGEX_OT.test(inv)) return 'OT';
  if (REGEX_CP.test(inv)) return 'CP';
  return 'ID';
}

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && i + 1 < text.length && text[i + 1] === '"') {
        currentCell += '"'; i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ';') { 
        currentRow.push(currentCell); currentCell = '';
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentCell); rows.push(currentRow);
        currentRow = []; currentCell = '';
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      } else {
        currentCell += char;
      }
    }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell); rows.push(currentRow);
  }
  return rows;
}

function processData(parsedRows) {
  const rawData = [];
  const idHoldingsCount = {}; 
  let lastEmitenName = "";
  
  let isNewFormat = false;
  for (let i = 0; i < Math.min(5, parsedRows.length); i++) {
    if (parsedRows[i][0] === 'DATE' || parsedRows[i][1] === 'SHARE_CODE') {
      isNewFormat = true;
      break;
    }
  }

  for (let index = 1; index < parsedRows.length; index++) {
    const row = parsedRows[index];
    if (row.length < 5) continue; 

    let ticker = "", emitenName = "", investor = "", categoryCode = "OT", localForeign = "", domicile = "";
    let shares = 0, percentage = 0, prevPercentage = 0;
    
    const cleanNum = (str) => parseFloat(String(str || "").replace(/,/g, '')) || 0;

    if (isNewFormat) {
      if (row[0] === 'DATE' || row[1] === 'SHARE_CODE') continue;
      ticker = row[1]?.trim() || "";
      emitenName = row[2]?.trim() || "";
      investor = row[3]?.trim() || "";
      categoryCode = row[4]?.trim().toUpperCase() || "OT";
      localForeign = row[5]?.trim().toUpperCase() || "";
      domicile = row[7]?.trim().toUpperCase() || "";
      shares = cleanNum(row[11]);
      percentage = cleanNum(row[12]);
      prevPercentage = percentage; 
    } else {
      const no = parseInt(row[0]);
      if (isNaN(no) || row.length < 18) continue;
      ticker = row[1]?.trim() || "";
      emitenName = row[2]?.trim() || lastEmitenName;
      lastEmitenName = emitenName;
      investor = row[4]?.trim() || row[5]?.trim() || row[3]?.trim() || "";
      categoryCode = getCategoryFallback(investor);
      domicile = row[9]?.trim().toUpperCase() || "";
      localForeign = row[12]?.trim().toUpperCase() || "";
      shares = cleanNum(row[17]);
      percentage = cleanNum(row[18]);
      prevPercentage = cleanNum(row[15]);
    }

    if (!ticker || ticker.toLowerCase() === "kode efek" || ticker.length < 3 || !investor) continue;
    if (!CATEGORY_NAMES[categoryCode]) categoryCode = 'OT';

    rawData.push({
      id: `row-${index}`, 
      ticker, 
      emitenName, 
      investor, 
      category: { code: categoryCode, name: CATEGORY_NAMES[categoryCode] }, 
      shares, 
      percentage, 
      prevPercentage, 
      status: (percentage !== prevPercentage) ? 'berubah' : 'tetap',
      localForeign, 
      domicile
    });

    if (categoryCode === 'ID' && percentage >= 5.0) {
      if (!idHoldingsCount[investor]) idHoldingsCount[investor] = new Set();
      idHoldingsCount[investor].add(ticker);
    }
  }

  const finalData = [];
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    let isPengendali = false;

    if (row.category.code === 'ID') {
      const numCompanies = idHoldingsCount[row.investor]?.size || 0;
      const isVerifiedFounder = KNOWN_FOUNDERS.some(f => row.investor.toUpperCase().includes(f));
      if (row.percentage >= 20 || numCompanies > 2 || isVerifiedFounder) {
        isPengendali = true;
      }
    }
    row.isPengendali = isPengendali;
    if (row.percentage >= 1.0) finalData.push(row);
  }

  return finalData.sort((a,b) => b.percentage - a.percentage);
}

export default function App() {
  const [data, setData] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isUploaded, setIsUploaded] = useState(false);
  const [isFetchingDB, setIsFetchingDB] = useState(true);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 400); 
    return () => clearTimeout(timer);
  }, [searchInput]);

  // --- MENGAMBIL DATA DEFAULT DARI FOLDER PUBLIC ---
  useEffect(() => {
    const loadDefaultData = async () => {
      try {
        setIsFetchingDB(true);
        // Mengambil file data-ksei.csv dari folder public
        const response = await fetch('/data-ksei.csv');
        if (!response.ok) {
          throw new Error("File default tidak ditemukan.");
        }
        const text = await response.text();
        const mappedData = processData(parseCSV(text));
        setData(mappedData);
        setIsUploaded(true);
      } catch (error) {
        console.error("Gagal memuat data default:", error);
        setIsUploaded(false);
      } finally {
        setIsFetchingDB(false);
      }
    };

    loadDefaultData();
  }, []);

  // --- MANUAL UPLOAD UNTUK UPDATE DATA LOKAL ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError('');
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const mappedData = processData(parseCSV(text));
        setData(mappedData);
        setIsUploaded(true);
      } catch (error) {
        console.error("Parsing Error:", error);
        setUploadError("Gagal membaca file CSV. Pastikan format sesuai.");
      }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  const triggerUploadUI = () => fileInputRef.current.click();

  const totalEmiten = new Set(data.map(d => d.ticker)).size;
  const totalInvestor = new Set(data.map(d => d.investor)).size;

  const renderContent = () => {
    if (isFetchingDB) {
       return (
         <div className="flex flex-col items-center justify-center py-32 opacity-70 h-full w-full">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <p className="text-blue-400 font-bold text-center text-lg">Memuat Data Analytics...</p>
         </div>
       );
    }
    if (!isUploaded && data.length === 0) return (
      <div className="mb-6 bg-blue-900/20 border border-blue-500/30 rounded-2xl p-6 flex flex-col items-start justify-between">
          <h3 className="text-blue-400 font-bold text-lg mb-2">Sistem Siap Digunakan</h3>
          <p className="text-sm text-slate-400 max-w-2xl">
            Sistem tidak menemukan file default di Cloud Vercel. Silakan klik tombol <b>"Upload Data KSEI"</b> untuk memuat file.
          </p>
      </div>
    );
    
    switch (activeTab) {
      case 'dashboard': return <DashboardView data={data} />;
      case 'emiten': return <EmitenView data={data} searchQuery={debouncedQuery} />;
      case 'investor': return <InvestorView data={data} searchQuery={debouncedQuery} />;
      case 'freefloat': return <FreeFloatView data={data} searchQuery={debouncedQuery} />;
      case 'network': return <NetworkView data={data} searchQuery={debouncedQuery} />;
      default: return <DashboardView data={data} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-300 font-sans flex flex-col md:flex-row overflow-hidden relative">
      <aside className="w-full md:w-64 bg-[#111827] border-b md:border-b-0 md:border-r border-slate-800 flex flex-col z-20 shrink-0">
        <div className="p-6 flex flex-col items-start gap-4 border-b border-slate-800/50">
          <div className="bg-white p-2 rounded-xl shadow-lg shadow-black/20 w-full flex items-center justify-center">
            <img src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjowvt7ARvZePh_g5Pf_00OjAVYkkiIX_SdWspqWvZBo1qL7Ixs2qM23GZcItU0BzacX7fYyaj62ipAiu5MqgqylHQyeT_7GYOrBmtgz6ZhEyv_d9EKzNjnUJCIRR2-IS5nPWLcJrctixDFZPzciKS5Zat-fpbYCOFQ2o1xfUB91aPT5e6Ys6SFB_J8fnza/s1060/LOGO%20PNG%20transparent.png" alt="Logo" className="h-12 w-auto object-contain" />
          </div>
          <div className="w-full">
            <p className="text-[11px] text-slate-300 font-semibold tracking-wide">Ownership Tracker &ge; 1%</p>
          </div>
        </div>
        <nav className="flex-1 px-4 py-4 md:py-8 space-y-2 flex flex-row md:flex-col overflow-x-auto md:overflow-visible scrollbar-hide">
          <NavButton icon={<Activity size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<Building2 size={20} />} label="Per Emiten" active={activeTab === 'emiten'} onClick={() => setActiveTab('emiten')} />
          <NavButton icon={<Users size={20} />} label="Per Investor" active={activeTab === 'investor'} onClick={() => setActiveTab('investor')} />
          <NavButton icon={<Layers size={20} />} label="Free Float" active={activeTab === 'freefloat'} onClick={() => setActiveTab('freefloat')} />
          <NavButton icon={<Network size={20} />} label="Ownership Mapping" active={activeTab === 'network'} onClick={() => setActiveTab('network')} />
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 bg-[#111827]/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 lg:px-10 z-10 shrink-0">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Pencarian cepat..."
              className="block w-full pl-10 pr-3 py-2.5 border border-slate-700 rounded-xl bg-slate-900/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-4">
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <button
              onClick={triggerUploadUI}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${isUploaded ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >
              {isUploaded ? <CheckCircle2 size={18} /> : <FileUp size={18} />}
              <span className="hidden sm:inline">{isUploaded ? 'Upload Data Baru' : 'Upload Data KSEI'}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
          {uploadError && (
             <div className="mb-6 bg-rose-500/20 border border-rose-500/30 rounded-2xl p-4 text-sm text-rose-400 flex items-center gap-3">
                <ShieldAlert size={20} />{uploadError}
             </div>
          )}
          {activeTab === 'dashboard' && isUploaded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <StatCard title="Total Emiten Terlacak" value={totalEmiten} icon={<Building2 />} color="text-emerald-400" />
              <StatCard title="Total Investor Berpengaruh" value={totalInvestor} icon={<Users />} color="text-indigo-400" />
            </div>
          )}
          <div className="max-w-7xl mx-auto h-full">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}

function Top10Card(props) {
  const { title, icon, data, isCountry = false, colorClass, isFreeFloat = false } = props;
  return (
    <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-5 flex flex-col h-[520px] shadow-lg">
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 shrink-0 border-b border-slate-700/50 pb-3">{icon} {title}</h2>
      <div className="overflow-y-auto pr-1 space-y-3 scrollbar-hide flex-1">
        {data.map((item, i) => (
          <div key={i} className="bg-slate-900/60 rounded-xl border border-slate-700/50 p-4 hover:border-slate-500 transition-colors">
             <div className="flex justify-between items-start border-b border-slate-700/50 pb-2 mb-2">
                <div className="font-bold text-white text-sm line-clamp-1 mr-2 flex items-center gap-2">
                   <span className={`text-xs px-2 py-0.5 rounded-md bg-slate-800 ${colorClass}`}>#{i+1}</span>
                   <span>{isCountry ? item.country : (isFreeFloat ? item.ticker : item.investor)}</span>
                </div>
                <div className={`font-mono font-bold text-sm text-right shrink-0 truncate max-w-[120px] ${colorClass}`}>
                   {isFreeFloat ? item.publicSharesVolume.toLocaleString() : item.totalShares.toLocaleString()}
                </div>
             </div>
             <div className="space-y-2 max-h-32 overflow-y-auto scrollbar-hide pr-1">
                {item.holdings.map((h, j) => (
                   <div key={j} className="flex justify-between items-center text-xs bg-[#0a0f1c]/50 p-1.5 rounded">
                      <span className={`font-bold w-12 shrink-0 ${isFreeFloat ? 'text-amber-400 truncate w-24' : 'text-blue-400'}`}>{isFreeFloat ? h.investor : h.ticker}</span>
                      <span className="text-slate-400 font-mono text-right flex-1 truncate pr-3">{h.shares.toLocaleString()} lbr</span>
                      <span className="text-slate-200 font-mono font-bold w-14 text-right shrink-0">{h.percentage.toFixed(2)}%</span>
                   </div>
                ))}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardView({ data }) {
  if (data.length === 0) return null;
  const { topIndividu, topInstitusi, topForeign, topLocal, topCountry, categoryStats, topFreeFloat } = useMemo(() => {
    const invMap = new Map(); const cMap = new Map(); const emitenFFMap = new Map();
    const catMap = { 'CP': 0, 'IB': 0, 'FD': 0, 'OT': 0, 'ID': 0, 'MF': 0, 'IS': 0, 'PF': 0, 'SC': 0 };
    let totalAllShares = 0;

    data.forEach(d => {
      const cleanInvestorName = d.investor.trim().toUpperCase().replace(/\s+/g, ' ');
      if (!invMap.has(cleanInvestorName)) invMap.set(cleanInvestorName, { investor: cleanInvestorName, type: d.category.code, localForeign: d.localForeign, totalShares: 0, holdings: [] });
      const inv = invMap.get(cleanInvestorName); inv.totalShares += d.shares; inv.holdings.push({ ticker: d.ticker, shares: d.shares, percentage: d.percentage });
      
      const country = d.domicile ? d.domicile.trim().toUpperCase() : 'OTHERS';
      if (!cMap.has(country)) cMap.set(country, { country, totalShares: 0, holdingsMap: new Map() });
      const c = cMap.get(country); c.totalShares += d.shares;
      if (!c.holdingsMap.has(d.ticker)) c.holdingsMap.set(d.ticker, { ticker: d.ticker, shares: 0, percentage: 0 });
      const h = c.holdingsMap.get(d.ticker); h.shares += d.shares; h.percentage += d.percentage;

      let code = d.category.code; if (catMap[code] === undefined) code = 'OT'; 
      catMap[code] += d.shares; totalAllShares += d.shares;

      if (!emitenFFMap.has(d.ticker)) emitenFFMap.set(d.ticker, { ticker: d.ticker, name: d.emitenName, nonPublicTotal: 0, totalSharesInCompany: 0, publicHolders: [] });
      const eFF = emitenFFMap.get(d.ticker);
      const isPengurang = ['CP', 'IB', 'FD', 'OT'].includes(d.category.code) || (d.category.code === 'ID' && d.isPengendali);
      
      if (eFF.totalSharesInCompany === 0 && d.percentage > 0) eFF.totalSharesInCompany = d.shares / (d.percentage / 100);
      if (isPengurang) eFF.nonPublicTotal += d.percentage; else eFF.publicHolders.push({ investor: cleanInvestorName, shares: d.shares, percentage: d.percentage });
    });

    const allInv = Array.from(invMap.values()); allInv.forEach(inv => inv.holdings.sort((a,b) => b.shares - a.shares));
    const allCountries = Array.from(cMap.values()).map(c => ({ country: c.country, totalShares: c.totalShares, holdings: Array.from(c.holdingsMap.values()).sort((a,b) => b.shares - a.shares) }));
    const categoryStats = Object.keys(catMap).map(code => ({ code, name: CATEGORY_NAMES[code], shares: catMap[code], percentage: totalAllShares > 0 ? (catMap[code] / totalAllShares) * 100 : 0 })).sort((a, b) => b.shares - a.shares);
    const allFreeFloats = Array.from(emitenFFMap.values()).map(e => {
       const ff = Math.max(0, Math.min(100, 100 - e.nonPublicTotal));
       const detectedPublicShares = e.publicHolders.reduce((sum, h) => sum + h.shares, 0);
       const publicSharesVolume = e.totalSharesInCompany * (ff / 100);
       return { ticker: e.ticker, name: e.name, freeFloat: ff, publicSharesVolume: publicSharesVolume, holdings: e.publicHolders.sort((a,b) => b.shares - a.shares) };
    });

    return {
      topIndividu: allInv.filter(i => i.type === 'ID').sort((a,b) => b.totalShares - a.totalShares).slice(0, 10),
      topInstitusi: allInv.filter(i => i.type !== 'ID').sort((a,b) => b.totalShares - a.totalShares).slice(0, 10),
      topForeign: allInv.filter(i => i.localForeign === 'A').sort((a,b) => b.totalShares - a.totalShares).slice(0, 10),
      topLocal: allInv.filter(i => i.localForeign === 'L').sort((a,b) => b.totalShares - a.totalShares).slice(0, 10),
      topCountry: allCountries.sort((a,b) => b.totalShares - a.totalShares).slice(0, 10),
      topFreeFloat: allFreeFloats.sort((a,b) => b.publicSharesVolume - a.publicSharesVolume).slice(0, 10),
      categoryStats
    };
  }, [data]);

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-6 shadow-lg mb-6">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-700/50 pb-3">
          <PieChart size={24} className="text-blue-500" /> Distribusi Kategori
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {categoryStats.map(stat => (
            <div key={stat.code} className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-300 text-sm truncate pr-2">{stat.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CAT_COLOR_MAP[stat.code]} bg-opacity-20 text-white`}>{stat.code}</span>
              </div>
              <div className="text-xl font-bold text-white mb-1">{stat.percentage.toFixed(2)}%</div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className={`${CAT_COLOR_MAP[stat.code]} h-1.5 rounded-full`} style={{ width: `${stat.percentage}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <Top10Card title="Top 10 Public Float" icon={<Layers size={20} className="text-emerald-400"/>} colorClass="text-emerald-400" data={topFreeFloat} isFreeFloat={true} />
        <Top10Card title="Top 10 Individu" icon={<User size={20} className="text-amber-500"/>} colorClass="text-amber-400" data={topIndividu} />
        <Top10Card title="Top 10 Institusi" icon={<Building2 size={20} className="text-blue-500"/>} colorClass="text-blue-400" data={topInstitusi} />
        <Top10Card title="Top 10 Foreign (Asing)" icon={<Globe size={20} className="text-emerald-500"/>} colorClass="text-emerald-400" data={topForeign} />
        <Top10Card title="Top 10 Local (Lokal)" icon={<MapPin size={20} className="text-rose-500"/>} colorClass="text-rose-400" data={topLocal} />
        <Top10Card title="Top 10 Country (Domisili)" icon={<Flag size={20} className="text-purple-500"/>} colorClass="text-purple-400" data={topCountry} isCountry={true} />
      </div>
    </div>
  );
}

function EmitenView({ data, searchQuery }) {
  const [alphaFilter, setAlphaFilter] = useState('A');

  const emitenGroupsArray = useMemo(() => {
    const groups = {};
    data.forEach(item => {
      if (!groups[item.ticker]) {
        groups[item.ticker] = { ticker: item.ticker, name: item.emitenName, holders: [], totalTracked: 0 };
      }
      groups[item.ticker].holders.push(item);
      groups[item.ticker].totalTracked += item.percentage;
    });
    
    return Object.values(groups).map(g => {
      g.holders.sort((a,b) => b.percentage - a.percentage);
      g.searchKey = `${g.ticker} ${g.name} ${g.holders.map(h => h.investor).join(' ')}`.toLowerCase();
      return g;
    }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [data]);

  const filteredTickers = useMemo(() => {
    let items = emitenGroupsArray;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(g => g.searchKey.includes(q));
    } 
    else if (alphaFilter !== 'ALL') {
      if (alphaFilter === '#') {
        items = items.filter(g => !/^[A-Z]/i.test(g.ticker.trim()));
      } else {
        items = items.filter(g => g.ticker.trim().toUpperCase().startsWith(alphaFilter));
      }
    }
    
    return items;
  }, [searchQuery, alphaFilter, emitenGroupsArray]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <AlphabetFilter selected={alphaFilter} onChange={setAlphaFilter} />

      {filteredTickers.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <Search size={48} className="mx-auto mb-4 opacity-20" />
          <p>Pencarian tidak ditemukan.</p>
        </div>
      )}

      {filteredTickers.map(group => {
        const publicFloat = Math.max(0, 100 - group.totalTracked);
        
        const pieData = group.holders.slice(0, 15).map((h, i) => ({
          label: h.investor,
          percentage: h.percentage,
          color: CHART_COLORS[i % CHART_COLORS.length]
        }));
        
        if (publicFloat > 0 || group.holders.length > 15) {
          const sisaPercentage = publicFloat + group.holders.slice(15).reduce((acc, curr) => acc + curr.percentage, 0);
          pieData.push({ label: 'Publik / Lainnya (< 1%)', percentage: sisaPercentage, color: '#334155' });
        }

        return (
          <div key={group.ticker} className="bg-[#151e2f] border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col xl:flex-row mb-6">
            <div className="xl:w-1/3 p-6 border-b xl:border-b-0 xl:border-r border-slate-800 bg-slate-900/30 flex flex-col justify-between">
              
              {/* BAGIAN JUDUL TICKER DAN NAMA PERUSAHAAN */}
              <div className="mb-6 text-center xl:text-left">
                <h2 className="text-3xl font-bold text-white tracking-tight">{group.ticker}</h2>
                <p className="text-sm text-slate-400 mt-1 font-medium leading-snug">{group.name}</p>
              </div>

              <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                <DonutChart data={pieData} size={140} />
                
                {/* BAGIAN INFORMASI TAMBAHAN DI BAWAH DONUT CHART */}
                <div className="w-full mt-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Total Terdeteksi (&ge; 1%)</span>
                    <span className="font-mono text-white font-bold">{group.totalTracked.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#334155]"></span> Publik / Sisa</span>
                    <span className="font-mono text-white font-bold">{publicFloat.toFixed(2)}%</span>
                  </div>
                </div>
              </div>

            </div>
            
            <div className="xl:w-2/3 p-6 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-700/50 text-xs uppercase text-slate-500 tracking-wider">
                    <th className="py-3 px-2 font-medium">Investor</th>
                    <th className="py-3 px-2 font-medium">Kategori</th>
                    <th className="py-3 px-2 font-medium text-right">Volume</th>
                    <th className="py-3 px-2 font-medium text-right">% Saham</th>
                  </tr>
                </thead>
                <tbody>
                  {group.holders.map((holder, idx) => (
                    <tr key={holder.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: idx < 15 ? CHART_COLORS[idx % CHART_COLORS.length] : '#334155' }}></div>
                          <span className="font-medium text-slate-200 text-sm leading-tight">{holder.investor}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <CategoryBadge category={holder.category} isPengendali={holder.isPengendali} small />
                      </td>
                      <td className="py-3 px-2 text-right text-slate-400 font-mono text-xs">
                        {holder.shares.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-bold text-white">
                        {holder.percentage.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InvestorView({ data, searchQuery }) {
  const [alphaFilter, setAlphaFilter] = useState('A');
  const investorGroupsArray = useMemo(() => {
    const groups = {};
    data.forEach(item => {
      if (!groups[item.investor]) groups[item.investor] = { investor: item.investor, category: item.category, holdings: [] };
      groups[item.investor].holdings.push(item);
    });
    return Object.values(groups).map(g => {
      g.holdings.sort((a,b) => b.percentage - a.percentage);
      g.searchKey = `${g.investor} ${g.holdings.map(h => h.ticker).join(' ')}`.toLowerCase();
      return g;
    }).sort((a, b) => a.investor.localeCompare(b.investor));
  }, [data]);

  const filteredInvestors = useMemo(() => {
    let items = investorGroupsArray;
    if (searchQuery) items = items.filter(g => g.searchKey.includes(searchQuery.toLowerCase()));
    else if (alphaFilter !== 'ALL') {
      if (alphaFilter === '#') items = items.filter(g => !/^[A-Z]/i.test(g.investor.trim()));
      else items = items.filter(g => g.investor.trim().toUpperCase().startsWith(alphaFilter));
    }
    return items;
  }, [searchQuery, alphaFilter, investorGroupsArray]);

  return (
    <div className="space-y-6">
      <AlphabetFilter selected={alphaFilter} onChange={setAlphaFilter} />
      {filteredInvestors.map(group => {
        const pieData = group.holdings.slice(0, 15).map((h, i) => ({ label: h.ticker, percentage: h.shares, color: CHART_COLORS[i % CHART_COLORS.length] }));
        return (
          <div key={group.investor} className="bg-[#151e2f] border border-slate-800 rounded-2xl flex flex-col xl:flex-row overflow-hidden shadow-lg mb-6">
            <div className="xl:w-1/3 p-6 bg-slate-900/30 flex flex-col items-center border-b xl:border-b-0 xl:border-r border-slate-800">
               <h2 className="text-lg font-bold text-white mb-2 text-center">{group.investor}</h2>
               <CategoryBadge category={group.category} />
               <div className="mt-4"><DonutChart data={pieData} size={140} /></div>
            </div>
            <div className="xl:w-2/3 p-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-700/50 text-slate-500"><th className="pb-3">Emiten</th><th className="pb-3 text-right">Volume</th><th className="pb-3 text-right">% Kuasa</th></tr></thead>
                <tbody>
                  {group.holdings.map(h => (
                    <tr key={h.id} className="border-b border-slate-800/30"><td className="py-3 font-bold text-indigo-400">{h.ticker}</td><td className="py-3 font-mono text-slate-400 text-right">{h.shares.toLocaleString()}</td><td className="py-3 font-mono text-white text-right">{h.percentage.toFixed(2)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FreeFloatView({ data, searchQuery }) {
  const [filterCategory, setFilterCategory] = useState('ALL');

  const emitenList = useMemo(() => {
    const groups = {};
    data.forEach(item => {
      if (!groups[item.ticker]) {
        groups[item.ticker] = { ticker: item.ticker, name: item.emitenName, nonPublicTotal: 0 };
      }
      const isPengurang = ['CP', 'IB', 'FD', 'OT'].includes(item.category.code) || item.isPengendali;
      if (isPengurang) groups[item.ticker].nonPublicTotal += item.percentage;
    });
    
    return Object.values(groups).map(g => {
      g.freeFloat = Math.max(0, Math.min(100, 100 - g.nonPublicTotal));
      g.searchKey = `${g.ticker} ${g.name}`.toLowerCase(); 
      
      if (g.freeFloat <= 5.0) {
        g.categoryLabel = "Low Free Float (\u2264 5%)";
        g.categoryColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
        g.catCode = 'LOW';
      } else if (g.freeFloat < 15.0) {
        g.categoryLabel = "Below Regulatory Risk (< 15%)";
        g.categoryColor = "bg-orange-500/10 text-orange-400 border-orange-500/20";
        g.catCode = 'BELOW';
      } else if (g.freeFloat <= 50.0) {
        g.categoryLabel = "Mid Float (15% - 50%)";
        g.categoryColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
        g.catCode = 'MID';
      } else {
        g.categoryLabel = "High Float (> 50%)";
        g.categoryColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        g.catCode = 'HIGH';
      }
      return g;
    }).sort((a, b) => a.freeFloat - b.freeFloat);
  }, [data]);

  const filteredItems = useMemo(() => {
    let items = emitenList;
    if (searchQuery) {
      items = items.filter(item => item.searchKey.includes(searchQuery.toLowerCase()));
    } 
    else if (filterCategory !== 'ALL') {
      items = items.filter(item => item.catCode === filterCategory);
    }
    return items;
  }, [searchQuery, emitenList, filterCategory]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-800/40 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-6 border-b border-slate-800 flex flex-col gap-5">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <h2 className="text-xl font-bold text-white flex items-center gap-2">
               <Layers size={24} className="text-indigo-400" />
               Daftar Emiten Berdasarkan Free Float
             </h2>
             <div className="px-4 py-2 rounded-lg bg-slate-900/50 border border-slate-700 font-mono font-bold text-slate-300">
               Total: {filteredItems.length} Emiten
             </div>
           </div>
           
           <div className="flex flex-wrap items-center gap-2">
             <div className="text-sm text-slate-400 flex items-center gap-1.5 mr-2">
               <Filter size={16} /> Filter:
             </div>
             <button onClick={() => setFilterCategory('LOW')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${filterCategory === 'LOW' ? 'bg-rose-600 text-white border-rose-500' : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'}`}>Low (&le; 5%)</button>
             <button onClick={() => setFilterCategory('BELOW')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${filterCategory === 'BELOW' ? 'bg-orange-600 text-white border-orange-500' : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20'}`}>Below (&lt; 15%)</button>
             <button onClick={() => setFilterCategory('MID')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${filterCategory === 'MID' ? 'bg-blue-600 text-white border-blue-500' : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'}`}>Mid (15% - 50%)</button>
             <button onClick={() => setFilterCategory('HIGH')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${filterCategory === 'HIGH' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}`}>High (&gt; 50%)</button>
             <button onClick={() => setFilterCategory('ALL')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${filterCategory === 'ALL' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:bg-slate-800'}`}>ALL</button>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/50 text-xs uppercase text-slate-500 tracking-wider">
                <th className="py-4 px-6 font-medium">Kode</th>
                <th className="py-4 px-6 font-medium">Nama Emiten</th>
                <th className="py-4 px-6 font-medium text-right">Non-Publik / Pengendali</th>
                <th className="py-4 px-6 font-medium text-right">Saham Publik (Float)</th>
                <th className="py-4 px-6 font-medium">Kategori Float</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.ticker} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                  <td className="py-4 px-6 font-bold text-white">{item.ticker}</td>
                  <td className="py-4 px-6 text-slate-300">{item.name}</td>
                  <td className="py-4 px-6 text-right font-mono text-rose-400">{item.nonPublicTotal.toFixed(2)}%</td>
                  <td className="py-4 px-6 text-right font-mono font-bold text-white text-lg">{item.freeFloat.toFixed(2)}%</td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold border ${item.categoryColor}`}>
                      {item.categoryLabel}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-slate-500">
                    Tidak ada emiten yang sesuai dengan pencarian atau filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NetworkView({ data, searchQuery }) {
  const canvasRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });

  const graphData = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return null;
    const q = searchQuery.toLowerCase();
    const directRows = data.filter(d => d.ticker.toLowerCase().includes(q) || d.investor.toLowerCase().includes(q));
    if (directRows.length === 0) return null;

    const involvedTickers = new Set(directRows.map(d => d.ticker));
    const involvedInvestors = new Set(directRows.map(d => d.investor));
    let expandedRows = data.filter(d => involvedTickers.has(d.ticker) || involvedInvestors.has(d.investor)).slice(0, 100); 

    const nodeMap = new Map(); const links = [];
    expandedRows.forEach(r => {
      if (!nodeMap.has(r.ticker)) nodeMap.set(r.ticker, { id: r.ticker, label: r.ticker, type: 'emiten', size: 18 });
      if (!nodeMap.has(r.investor)) nodeMap.set(r.investor, { id: r.investor, label: r.investor, type: 'investor', size: Math.max(10, Math.min(24, r.percentage / 1.5)) });
      links.push({ source: r.investor, target: r.ticker, value: r.percentage });
    });
    return { nodes: Array.from(nodeMap.values()), links };
  }, [data, searchQuery]);

  useEffect(() => {
    if (!graphData) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resize = () => { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; };
    window.addEventListener('resize', resize); resize();
    transformRef.current = { x: 0, y: 0, k: 1 };

    let nodes = graphData.nodes.map(n => ({ ...n, x: canvas.width / 2 + (Math.random() - 0.5) * 300, y: canvas.height / 2 + (Math.random() - 0.5) * 300, vx: 0, vy: 0 }));
    let simLinks = graphData.links.map(l => ({ ...l, sourceNode: nodes.find(n => n.id === l.source), targetNode: nodes.find(n => n.id === l.target) })).filter(l => l.sourceNode && l.targetNode);

    let isSimulating = true;
    const simulate = () => {
      if (!isSimulating) return;
      const t = transformRef.current; let totalVelocity = 0;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x; const dy = nodes[j].y - nodes[i].y; const distSq = dx * dx + dy * dy || 1;
          if (distSq < 15000) { 
            const force = 3000 / distSq; const dist = Math.sqrt(distSq);
            nodes[i].vx -= (dx / dist) * force; nodes[i].vy -= (dy / dist) * force;
            nodes[j].vx += (dx / dist) * force; nodes[j].vy += (dy / dist) * force;
          }
        }
      }
      simLinks.forEach(link => {
        const { sourceNode: source, targetNode: target } = link;
        const dx = target.x - source.x; const dy = target.y - source.y; const dist = Math.sqrt(dx * dx + dy * dy) || 1; const force = (dist - 100) * 0.05; 
        source.vx += (dx / dist) * force; source.vy += (dy / dist) * force;
        target.vx -= (dx / dist) * force; target.vy -= (dy / dist) * force;
      });
      nodes.forEach(n => {
        const dx = (canvas.width / 2) - n.x; const dy = (canvas.height / 2) - n.y;
        n.vx += dx * 0.005; n.vy += dy * 0.005;
        n.vx *= 0.85; n.vy *= 0.85; n.x += n.vx; n.y += n.vy; totalVelocity += Math.abs(n.vx) + Math.abs(n.vy);
      });

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.translate(t.x, t.y); ctx.scale(t.k, t.k);

      simLinks.forEach(link => {
        ctx.beginPath(); ctx.moveTo(link.sourceNode.x, link.sourceNode.y); ctx.lineTo(link.targetNode.x, link.targetNode.y);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)'; ctx.stroke();
      });

      nodes.forEach(n => {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fillStyle = n.type === 'emiten' ? '#3b82f6' : '#f59e0b'; ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        let displayLabel = n.label.length > 15 ? n.label.substring(0, 15) + '...' : n.label;
        ctx.fillText(displayLabel, n.x, n.y + n.size + 14);
      });
      ctx.restore();

      if (totalVelocity < 0.5) isSimulating = false;
      else animationFrameId = requestAnimationFrame(simulate);
    };
    simulate();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrameId); };
  }, [graphData]);

  return (
    <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-6 shadow-lg h-[600px] flex flex-col">
       <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Network size={24} className="text-indigo-400" /> Ownership Network Map</h2>
       {!graphData ? (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700/50 rounded-xl bg-slate-900/20">
             <p className="text-slate-400 text-center">Ketik nama Emiten/Investor di kolom Search atas untuk merender network.</p>
          </div>
       ) : (
          <div className="flex-1 relative bg-[#0a0f1c] rounded-xl overflow-hidden border border-slate-700/50 shadow-inner">
             <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          </div>
       )}
    </div>
  );
}

function DonutChart({ data, size = 120 }) {
  let currentPercent = 0;
  const gradientStops = data.map(d => {
    const start = currentPercent.toFixed(2); const end = (currentPercent + d.percentage).toFixed(2); currentPercent += d.percentage;
    return `${d.color} ${start}% ${end}%`;
  }).join(', ');
  return (
    <div className="relative rounded-full flex items-center justify-center shrink-0 shadow-xl" style={{ width: size, height: size, background: currentPercent > 0 ? `conic-gradient(${gradientStops})` : '#1e293b' }}>
      <div className="bg-[#151e2f] rounded-full absolute inset-0 m-auto" style={{ width: size * 0.65, height: size * 0.65 }}></div>
    </div>
  );
}

function AlphabetFilter({ selected, onChange }) {
  const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#', 'ALL'];
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2 scrollbar-hide mb-6">
      {letters.map(l => (
        <button key={l} onClick={() => onChange(l)} className={`shrink-0 flex items-center justify-center rounded-md text-xs font-bold ${l === 'ALL' ? 'px-4 h-8' : 'w-8 h-8'} ${selected === l ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400'}`}>{l === 'ALL' ? 'SEMUA' : l}</button>
      ))}
    </div>
  );
}

function NavButton({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center space-x-3 w-full px-4 py-3 rounded-xl transition-all whitespace-nowrap md:whitespace-normal ${active ? 'bg-blue-600/10 text-blue-500 font-semibold' : 'text-slate-400 hover:text-white'}`}>{icon}<span>{label}</span></button>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className="bg-[#151e2f] border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
      <div><p className="text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">{title}</p><h3 className="text-3xl font-bold text-white">{value}</h3></div>
      <div className={`p-4 bg-slate-800/50 rounded-xl ${color}`}>{icon}</div>
    </div>
  );
}

function CategoryBadge({ category, isPengendali, small }) {
  const { code, name } = category;
  const style = CAT_COLOR_MAP[code] ? `${CAT_COLOR_MAP[code]}/10 text-${CAT_COLOR_MAP[code].split('-')[1]}-400` : 'bg-slate-500/10 text-slate-400';
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className={`inline-flex items-center rounded-md font-semibold border border-transparent px-2 py-0.5 text-[10px] ${style}`}>{code} - {name}</span>
    </div>
  );
}
