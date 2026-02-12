import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  Plus,
  Search,
  ChevronLeft,
  FileText,
  Package,
  Printer,
  Trash2,
  CheckCircle,
  Clock,
  MessageSquare,
  Briefcase,
  PlayCircle,
  StopCircle,
  Target,
  TrendingUp,
  Calculator,
  ArrowRight,
  Wallet,
  PieChart,
  CalendarCheck,
  Globe,
  Share2,
  Loader,
  LogIn,
  Edit2,
  Save,
  Wand2,
  Send,
  X,
  Layers,
  AlertTriangle,
  Info,
  Bell,
  Calendar as CalendarIcon,
  Filter,
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
} from 'firebase/auth';
import type { User } from 'firebase/auth';

// --- TYPES & INTERFACES ---
interface Product {
  id: string;
  name: string;
  price: number; // CPL VENDU
  cost?: number; // CPL ACHAT
  platform?: string;
  description?: string;
}

interface Contact {
  id: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
  status: string;
  projectedBudget?: number;
  interestedProductId?: string;
  campaignStartDate?: string | null;
  createdAt?: string;
}

interface InvoiceItem {
  name: string;
  price: number;
  qty: number;
  cost?: number;
}

interface Invoice {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  status: string;
  amount: number;
  items: InvoiceItem[];
}

interface Interaction {
  id: string;
  contactId: string;
  type: string;
  content: string;
  createdAt: string;
}

interface Simulation {
  id: string;
  budget: number;
  productId: string;
  productName: string;
  productPlatform?: string;
  clientId?: string;
  clientName?: string;
  stats: {
    volumeTotal: number;
    costTotal: number;
    profit: number;
    dailyVolume: number;
    dailyBudget: number;
    margin: number;
    fees: number;
    arbitrage: number;
  };
  createdAt: string;
}

interface AppSettings {
  companyName: string;
  address: string;
  email: string;
  phone: string;
  iban: string;
  invoiceFooter: string;
  primaryColor: string;
  logoUrl: string;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

// --- CONFIGURATION FIREBASE ---
const hardcodedConfig = {
  apiKey: 'AIzaSyDY6zXLeebKhMxL_2_mfQOYV44JuoCArK0',
  authDomain: 'crm-leadpartner.firebaseapp.com',
  projectId: 'crm-leadpartner',
  storageBucket: 'crm-leadpartner.firebasestorage.app',
  messagingSenderId: '588502456936',
  appId: '1:588502456936:web:5c509a0c418f34f77239dd',
  measurementId: 'G-6QM0LM69Z1',
};

const stackblitzConfig = JSON.parse((window as any).__firebase_config || '{}');
const firebaseConfig =
  Object.keys(stackblitzConfig).length > 0 ? stackblitzConfig : hardcodedConfig;

const RAW_APP_ID = (window as any).__app_id || 'leadpartner-crm-v39-prod';
const APP_ID = RAW_APP_ID.replace(/[^a-zA-Z0-9-_]/g, '_');

let app: any, db: any, auth: any;
try {
  if (
    firebaseConfig &&
    Object.keys(firebaseConfig).length > 0 &&
    firebaseConfig.apiKey
  ) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } else {
    console.warn('Mode Hors-Ligne activé (Aucune config Firebase valide)');
  }
} catch (e) {
  console.error('Erreur init Firebase:', e);
}

// --- CONSTANTES ---
const PIPELINE_STAGES = [
  { id: 'nouveau', label: 'Nouveau', color: 'bg-slate-100 border-slate-300' },
  {
    id: 'qualification',
    label: 'Qualification',
    color: 'bg-blue-50 border-blue-200',
  },
  {
    id: 'proposition',
    label: 'Proposition',
    color: 'bg-indigo-50 border-indigo-200',
  },
  {
    id: 'negociation',
    label: 'Négociation',
    color: 'bg-orange-50 border-orange-200',
  },
  {
    id: 'gagne',
    label: 'Gagné (Client)',
    color: 'bg-emerald-50 border-emerald-200',
  },
  { id: 'perdu', label: 'Perdu', color: 'bg-red-50 border-red-200' },
];

const INVOICE_STATUSES: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'bg-slate-100 text-slate-600' },
  envoyee: { label: 'Envoyée', color: 'bg-blue-100 text-blue-600' },
  payee: { label: 'Payée', color: 'bg-emerald-100 text-emerald-600' },
  retard: { label: 'En retard', color: 'bg-red-100 text-red-600' },
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (amount?: number) => {
  return new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
};

const getCampaignProgress = (startDate?: string | null) => {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  const diffTime = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0)
    return { day: 0, percent: 0, label: 'Démarre bientôt', finished: false };
  if (diffDays >= 30)
    return {
      day: 30,
      percent: 100,
      finished: true,
      label: 'Terminée (Relancer !)',
    };

  return {
    day: diffDays,
    percent: (diffDays / 30) * 100,
    finished: false,
    label: `Jour ${diffDays} / 30`,
  };
};

// --- COMPOSANT LOGIN ---
const LoginScreen = ({
  onLogin,
  addNotification,
}: {
  onLogin: () => void;
  addNotification: (t: any, m: string) => void;
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onLogin();
    } else {
      addNotification('error', 'Veuillez remplir les champs');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <span className="text-2xl font-bold text-white">LP</span>
          </div>
          <h1 className="text-2xl font-bold text-white">LeadPartner CRM</h1>
          <p className="text-blue-100 text-sm mt-2">
            Gestion d'agence & Arbitrage LeadGen
          </p>
        </div>
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="nom@exemple.com"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <LogIn size={20} /> Se connecter
            </button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-400">Version 39.0 (Prod)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- COMPOSANT PRINCIPAL ---
export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAppAuthenticated, setIsAppAuthenticated] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // UI States globaux
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [projectionTab, setProjectionTab] = useState('all');

  // Données
  const [settings, setSettings] = useState<AppSettings>({
    companyName: 'Mon Agence LeadGen',
    address: "Adresse de l'agence...",
    email: 'contact@agence.ch',
    phone: '',
    iban: '',
    invoiceFooter: 'Non soumis à la TVA. Paiement à 30 jours net.',
    primaryColor: '#2563eb',
    logoUrl: '',
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);

  // UI States
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editContactData, setEditContactData] = useState<Partial<Contact>>({});
  const [newNoteContent, setNewNoteContent] = useState('');

  const [showModal, setShowModal] = useState<string | null>(null);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentInvoice, setCurrentInvoice] = useState<Partial<Invoice> | null>(
    null
  );
  const [contactFilterType, setContactFilterType] = useState('all');

  // Facturation
  const [invoiceBudget, setInvoiceBudget] = useState<number | string>(0);
  const [invoiceThemeId, setInvoiceThemeId] = useState('');
  const [invoiceMarginPercent, setInvoiceMarginPercent] = useState(35);

  // Planificateur
  const [planBudget, setPlanBudget] = useState(1000);
  const [planProductId, setPlanProductId] = useState('');
  const [planClientId, setPlanClientId] = useState('');

  // Auto-Seed Ref
  const hasCheckedDefaults = useRef(false);

  // --- HELPERS UI ---
  const addNotification = (
    type: 'success' | 'error' | 'info',
    message: string
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };

  const openConfirm = (
    title: string,
    message: string,
    onConfirm: () => void
  ) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // --- AUTH ---
  useEffect(() => {
    const initAuth = async () => {
      if (!auth) {
        setIsOfflineMode(true);
        setUser({ uid: 'offline', email: 'demo@offline' } as User);
        setLoading(false);
        return;
      }

      if ((window as any).__initial_auth_token) {
        await signInWithCustomToken(auth, (window as any).__initial_auth_token);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn('Auth Anonyme échoué, passage en mode offline', e);
          setIsOfflineMode(true);
          setUser({ uid: 'offline', email: 'demo@offline' } as User);
        }
      }
    };
    initAuth();
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) {
          setUser(u);
          setIsOfflineMode(false);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, []);

  // --- SYNC & AUTO-SEED CAMPAGNES ---
  useEffect(() => {
    if (!user || isOfflineMode || !db) return;
    const basePath = `artifacts/${APP_ID}/users/${user.uid}`;
    try {
      const unsubs = [
        onSnapshot(collection(db, `${basePath}/contacts`), (s: any) =>
          setContacts(
            s.docs.map((d: any) => ({ id: d.id, ...d.data() } as Contact))
          )
        ),
        onSnapshot(collection(db, `${basePath}/products`), (s: any) => {
          const loaded = s.docs.map(
            (d: any) => ({ id: d.id, ...d.data() } as Product)
          );
          setProducts(loaded);

          if (s.empty && !hasCheckedDefaults.current) {
            hasCheckedDefaults.current = true;
            const batch = writeBatch(db);
            const p1 = doc(collection(db, `${basePath}/products`));
            batch.set(p1, {
              name: '3P',
              price: 0,
              cost: 0,
              platform: 'meta',
              description: '3ème Pilier (Meta)',
            });
            const p2 = doc(collection(db, `${basePath}/products`));
            batch.set(p2, {
              name: 'LPP',
              price: 0,
              cost: 0,
              platform: 'meta',
              description: 'LPP (Meta)',
            });
            const p3 = doc(collection(db, `${basePath}/products`));
            batch.set(p3, {
              name: 'CMU LAMal',
              price: 0,
              cost: 0,
              platform: 'meta',
              description: 'CMU (Meta)',
            });
            const p4 = doc(collection(db, `${basePath}/products`));
            batch.set(p4, {
              name: 'LPP',
              price: 0,
              cost: 0,
              platform: 'google',
              description: 'LPP (Google Search)',
            });
            batch
              .commit()
              .then(() => console.log('Campagnes par défaut créées'));
          } else if (!s.empty) {
            hasCheckedDefaults.current = true;
          }
        }),
        onSnapshot(collection(db, `${basePath}/invoices`), (s: any) =>
          setInvoices(
            s.docs.map((d: any) => ({ id: d.id, ...d.data() } as Invoice))
          )
        ),
        onSnapshot(collection(db, `${basePath}/interactions`), (s: any) =>
          setInteractions(
            s.docs.map((d: any) => ({ id: d.id, ...d.data() } as Interaction))
          )
        ),
        onSnapshot(collection(db, `${basePath}/simulations`), (s: any) =>
          setSimulations(
            s.docs.map((d: any) => ({ id: d.id, ...d.data() } as Simulation))
          )
        ),
        onSnapshot(doc(db, `${basePath}/config`, 'general'), (s: any) => {
          if (s.exists())
            setSettings((prev) => ({ ...prev, ...s.data() } as AppSettings));
        }),
      ];
      return () => unsubs.forEach((u) => u());
    } catch (e) {
      console.warn('Erreur Sync DB', e);
      setIsOfflineMode(true);
    }
  }, [user, isOfflineMode]);

  // --- FILTRES & STATS ---
  const displayedContacts = useMemo(() => {
    let filtered = contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.company?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (contactFilterType === 'client')
      filtered = filtered.filter((c) => c.status === 'gagne');
    else if (contactFilterType === 'prospect')
      filtered = filtered.filter(
        (c) => c.status !== 'gagne' && c.status !== 'perdu'
      );
    return filtered;
  }, [contacts, searchTerm, contactFilterType]);

  const stats = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // 1. Factures (Réel)
    const monthInvoices = invoices.filter((i) => {
      const d = new Date(i.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const totalPaidInvoices = invoices.reduce(
      (acc, i) => (i.status === 'payee' ? acc + Number(i.amount ?? 0) : acc),
      0
    );
    const monthlyInvoicesAmount = monthInvoices.reduce(
      (acc, i) => acc + Number(i.amount ?? 0),
      0
    );

    // 2. Simulations (Projections Confirmées)
    const totalSimulations = simulations.reduce(
      (acc, s) => acc + Number(s.budget ?? 0),
      0
    );
    const monthSimulations = simulations.filter((s) => {
      const d = new Date(s.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const monthlySimulationsAmount = monthSimulations.reduce(
      (acc, s) => acc + Number(s.budget ?? 0),
      0
    );

    return {
      caMensuel: monthlyInvoicesAmount + monthlySimulationsAmount, // Factures du mois + Projections signées du mois
      caTotal: totalPaidInvoices + totalSimulations, // Total encaissé + Total signé
      pipelineValue: contacts.reduce(
        (acc, c) =>
          c.status !== 'gagne' && c.status !== 'perdu'
            ? acc + Number(c.projectedBudget ?? 0)
            : acc,
        0
      ),
      activeCampaigns: contacts.filter((c) => c.campaignStartDate).length,
    };
  }, [invoices, contacts, simulations]);

  // --- ACTIONS ---
  const handleCreate = async (col: string, data: any) => {
    if (isOfflineMode)
      return addNotification(
        'error',
        'Mode hors-ligne : Sauvegarde impossible'
      );
    if (!user) return;
    try {
      await addDoc(
        collection(db, `artifacts/${APP_ID}/users/${user.uid}/${col}`),
        { ...data, createdAt: new Date().toISOString() }
      );
      setShowModal(null);
      addNotification('success', 'Élément créé avec succès');
    } catch (e) {
      addNotification('error', 'Erreur lors de la création');
    }
  };

  const handleUpdate = async (col: string, id: string, data: any) => {
    if (isOfflineMode || !user) return;
    try {
      await updateDoc(
        doc(db, `artifacts/${APP_ID}/users/${user.uid}/${col}`, id),
        data
      );
      addNotification('success', 'Mise à jour effectuée');
    } catch (e) {
      addNotification('error', 'Erreur de mise à jour');
    }
  };

  const handleDelete = async (col: string, id: string) => {
    if (isOfflineMode || !user) return;
    openConfirm(
      "Supprimer l'élément ?",
      'Cette action est irréversible.',
      async () => {
        try {
          await deleteDoc(
            doc(db, `artifacts/${APP_ID}/users/${user.uid}/${col}`, id)
          );
          if (col === 'contacts' && selectedContactId === id)
            setSelectedContactId(null);
          addNotification('success', 'Suppression réussie');
        } catch (e) {
          addNotification('error', 'Erreur de suppression');
        }
      }
    );
  };

  const handleSaveProductForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get('name'),
      price: Number(fd.get('price')),
      cost: Number(fd.get('cost')),
      platform: fd.get('platform'),
      description: fd.get('description'),
    };
    if (currentProduct && currentProduct.id)
      await handleUpdate('products', currentProduct.id, data);
    else await handleCreate('products', data);
    setShowModal(null);
    setCurrentProduct(null);
  };

  const handleSaveContactEdit = async () => {
    if (!selectedContactId || !user) return;
    await handleUpdate('contacts', selectedContactId, editContactData);
    setIsEditingContact(false);
  };

  const handleAddQuickNote = async () => {
    if (!selectedContactId || !newNoteContent.trim() || !user) return;
    await handleCreate('interactions', {
      contactId: selectedContactId,
      type: 'note',
      content: newNoteContent,
    });
    setNewNoteContent('');
  };

  const handleSaveSimulation = async (simStats: any) => {
    if (!user) return;
    const activeProduct = products.find((p) => p.id === planProductId);
    if (!activeProduct) return;
    const activeClient = contacts.find((c) => c.id === planClientId);
    const simData: Omit<Simulation, 'id'> = {
      budget: planBudget,
      productId: planProductId,
      productName: activeProduct.name,
      productPlatform: activeProduct.platform,
      clientId: planClientId,
      clientName: activeClient ? activeClient.company : 'Client Inconnu',
      stats: simStats,
      createdAt: new Date().toISOString(),
    };
    await addDoc(
      collection(db, `artifacts/${APP_ID}/users/${user.uid}/simulations`),
      simData
    );
    addNotification('success', 'Simulation ajoutée au tableau');
  };

  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const newSettings = {
      companyName: fd.get('companyName'),
      address: fd.get('address'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      iban: fd.get('iban'),
      invoiceFooter: fd.get('invoiceFooter'),
      logoUrl: fd.get('logoUrl'),
      primaryColor: settings.primaryColor,
    };
    await setDoc(
      doc(db, `artifacts/${APP_ID}/users/${user.uid}/config`, 'general'),
      newSettings
    );
    setSettings(newSettings as AppSettings);
    addNotification('success', 'Paramètres sauvegardés !');
  };

  const handleGenerateInvoice = () => {
    if (!invoiceBudget || !invoiceThemeId) return;
    const theme = products.find((p) => p.id === invoiceThemeId);
    const budget = Number(invoiceBudget);
    const margin = Number(invoiceMarginPercent) / 100;

    const mediaBudget = budget * (1 - margin);
    const managementFees = budget * margin;

    const newItems = [
      {
        name: `Budget Net Investi - ${theme?.name || 'Campagne'} (${
          theme?.platform || 'Mix'
        })`,
        price: mediaBudget,
        qty: 1,
      },
      {
        name: `Frais de Gestion & Optimisation (${invoiceMarginPercent}%)`,
        price: managementFees,
        qty: 1,
      },
    ];
    setCurrentInvoice({ ...currentInvoice, items: newItems } as Invoice);
  };

  const handleSaveInvoice = async () => {
    if (!user || !currentInvoice?.clientId)
      return addNotification('error', 'Veuillez sélectionner un client.');

    // Nettoyage des données pour éviter les valeurs 'undefined' qui bloquent Firestore
    // On utilise JSON.parse(JSON.stringify(...)) pour supprimer automatiquement les clés undefined
    const cleanInvoiceData = JSON.parse(JSON.stringify(currentInvoice));

    const items = cleanInvoiceData.items || [];
    const amount = items.reduce(
      (acc: number, item: any) => acc + item.price * item.qty,
      0
    );
    const client = contacts.find((c) => c.id === cleanInvoiceData.clientId);

    const invData = {
      ...cleanInvoiceData,
      amount,
      clientName: client?.company || 'Client Inconnu',
    };

    try {
      if (invData.id) {
        await handleUpdate('invoices', invData.id, invData);
      } else {
        // Création : on s'assure qu'il n'y a pas d'ID undefined qui traîne
        delete invData.id;
        await setDoc(
          doc(
            db,
            `artifacts/${APP_ID}/users/${user!.uid}/invoices`,
            `INV-${Date.now()}`
          ),
          { ...invData, status: 'brouillon', date: new Date().toISOString() }
        );
      }
      setShowModal(null);
      addNotification('success', 'Facture sauvegardée');
    } catch (e) {
      console.error('Erreur sauvegarde facture:', e);
      addNotification(
        'error',
        'Erreur lors de la sauvegarde de la facture. Vérifiez les champs.'
      );
    }
  };

  const toggleCampaign = async (contact: Contact) => {
    if (contact.campaignStartDate) {
      openConfirm(
        'Arrêter la campagne ?',
        'Le suivi des jours sera réinitialisé.',
        async () => {
          await handleUpdate('contacts', contact.id, {
            campaignStartDate: null,
          });
          addNotification('info', 'Campagne arrêtée');
        }
      );
    } else {
      await handleUpdate('contacts', contact.id, {
        campaignStartDate: new Date().toISOString(),
      });
      addNotification('success', 'Campagne démarrée (30j)');
    }
  };

  // --- RENDERERS ---

  const renderCalendar = () => {
    const activeCampaigns = contacts
      .filter((c) => c.campaignStartDate)
      .map((c) => {
        const start = new Date(c.campaignStartDate!);
        const end = new Date(start);
        end.setDate(start.getDate() + 30);

        const now = new Date();
        const diffTime = end.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return { contact: c, start, end, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft); // Trié du plus urgent au moins urgent

    const urgent = activeCampaigns.filter((c) => c.daysLeft <= 0);
    const warning = activeCampaigns.filter(
      (c) => c.daysLeft > 0 && c.daysLeft <= 7
    );
    const safe = activeCampaigns.filter((c) => c.daysLeft > 7);

    const CalendarCard = ({
      item,
      type,
    }: {
      item: (typeof activeCampaigns)[0];
      type: 'urgent' | 'warning' | 'safe';
    }) => {
      const product = products.find(
        (p) => p.id === item.contact.interestedProductId
      );
      return (
        <div
          className={`p-4 rounded-xl border flex justify-between items-center bg-white shadow-sm ${
            type === 'urgent'
              ? 'border-red-200 bg-red-50'
              : type === 'warning'
              ? 'border-orange-200'
              : 'border-slate-200'
          }`}
        >
          <div>
            <h4 className="font-bold text-slate-800">{item.contact.company}</h4>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <CalendarCheck size={12} /> Fin :{' '}
              {formatDate(item.end.toISOString())}
            </p>
            {product && (
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-1 inline-block">
                {product.name}
              </span>
            )}
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <span
              className={`font-bold text-lg ${
                type === 'urgent'
                  ? 'text-red-600'
                  : type === 'warning'
                  ? 'text-orange-600'
                  : 'text-emerald-600'
              }`}
            >
              {item.daysLeft <= 0 ? "Aujourd'hui" : `J-${item.daysLeft}`}
            </span>
            <button
              onClick={() => toggleCampaign(item.contact)}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs px-2 py-1 rounded flex items-center gap-1 shadow-sm"
            >
              <StopCircle size={12} /> Couper Budget
            </button>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarIcon className="text-blue-600" /> Calendrier des Coupures
          (Budget Cut)
        </h2>

        {activeCampaigns.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
            <Info className="mx-auto mb-2 opacity-50" size={32} />
            <p>Aucune campagne active à suivre.</p>
          </div>
        )}

        {urgent.length > 0 && (
          <div>
            <h3 className="text-red-600 font-bold uppercase text-xs mb-3 flex items-center gap-2">
              <AlertTriangle size={14} /> À Couper (Urgent)
            </h3>
            <div className="grid gap-3">
              {urgent.map((item) => (
                <CalendarCard key={item.contact.id} item={item} type="urgent" />
              ))}
            </div>
          </div>
        )}

        {warning.length > 0 && (
          <div>
            <h3 className="text-orange-600 font-bold uppercase text-xs mb-3 flex items-center gap-2">
              <Bell size={14} /> Cette semaine
            </h3>
            <div className="grid gap-3">
              {warning.map((item) => (
                <CalendarCard
                  key={item.contact.id}
                  item={item}
                  type="warning"
                />
              ))}
            </div>
          </div>
        )}

        {safe.length > 0 && (
          <div>
            <h3 className="text-emerald-600 font-bold uppercase text-xs mb-3 flex items-center gap-2">
              <CheckCircle size={14} /> En cours
            </h3>
            <div className="grid gap-3">
              {safe.map((item) => (
                <CalendarCard key={item.contact.id} item={item} type="safe" />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProjections = () => {
    const activeProduct =
      products.find((p) => p.id === planProductId) || products[0];
    let planStats = {
      volumeTotal: 0,
      costTotal: 0,
      profit: 0,
      dailyVolume: 0,
      dailyBudget: 0,
      margin: 0,
      fees: 0,
      arbitrage: 0,
    };

    if (activeProduct && planBudget > 0 && activeProduct.price > 0) {
      const fees = planBudget * 0.35;
      const netMedia = planBudget * 0.65;
      const volumeTotal = Math.floor(netMedia / activeProduct.price);
      const costTotal = volumeTotal * Number(activeProduct.cost ?? 0);
      const arbitrage = netMedia - costTotal;
      const profit = fees + arbitrage;
      const margin = (profit / planBudget) * 100;

      planStats = {
        volumeTotal,
        costTotal,
        profit,
        dailyVolume: volumeTotal / 30,
        dailyBudget: costTotal / 30,
        margin,
        fees,
        arbitrage,
      };
    }

    // KPI CALCULATIONS
    const totalSimulations = simulations.length;
    const globalStats = simulations.reduce(
      (acc, sim) => {
        return {
          totalBudget: acc.totalBudget + sim.budget,
          totalMediaSpend: acc.totalMediaSpend + sim.stats.costTotal,
          totalProfit: acc.totalProfit + sim.stats.profit,
          totalLeads: acc.totalLeads + sim.stats.volumeTotal,
        };
      },
      { totalBudget: 0, totalMediaSpend: 0, totalProfit: 0, totalLeads: 0 }
    );

    const globalMarginPercent =
      globalStats.totalBudget > 0
        ? (globalStats.totalProfit / globalStats.totalBudget) * 100
        : 0;

    const spendByPlatform = simulations.reduce((acc, sim) => {
      const plat = sim.productPlatform || 'Autre';
      acc[plat] = (acc[plat] || 0) + sim.stats.costTotal;
      return acc;
    }, {} as Record<string, number>);

    // GROUP SIMULATIONS BY CAMPAIGN FOR TABS
    const activeCampaignIds = Array.from(
      new Set(simulations.map((s) => s.productId))
    );
    const activeCampaignTabs = products.filter((p) =>
      activeCampaignIds.includes(p.id)
    );

    return (
      <div className="space-y-8 animate-fade-in pb-12">
        {/* SECTION 1: DASHBOARD GLOBAL */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Target className="text-blue-600" /> Pilotage Média & Objectifs
          </h2>

          {/* CARDS KPI */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase">
                  CA Client Signé
                </p>
                <Wallet className="text-blue-200" size={20} />
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {formatCurrency(globalStats.totalBudget)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {totalSimulations} contrats
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase">
                  Budget Média (Dépense)
                </p>
                <PieChart className="text-orange-200" size={20} />
              </div>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(globalStats.totalMediaSpend)}
              </p>
              <div className="flex gap-2 mt-1">
                {Object.entries(spendByPlatform).map(([plat, amount]) => (
                  <span
                    key={plat}
                    className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded capitalize"
                  >
                    {plat}: {formatCurrency(amount)}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase">
                  Marge Nette (Poche)
                </p>
                <TrendingUp className="text-emerald-200" size={20} />
              </div>
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(globalStats.totalProfit)}
              </p>
              <p className="text-xs text-emerald-700 font-bold mt-1">
                {globalMarginPercent.toFixed(1)}% de marge globale
              </p>
            </div>

            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between text-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-slate-400 uppercase">
                  Objectif Leads
                </p>
                <Users className="text-slate-600" size={20} />
              </div>
              <p className="text-3xl font-bold">{globalStats.totalLeads}</p>
              <p className="text-xs text-slate-400 mt-1">
                Leads à livrer ce mois
              </p>
            </div>
          </div>

          {/* TABS & TABLEAU RÉPARTITION */}
          {simulations.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex gap-4">
                  <button
                    onClick={() => setProjectionTab('all')}
                    className={`text-sm font-bold pb-1 border-b-2 transition-colors ${
                      projectionTab === 'all'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Vue Globale
                  </button>
                  {activeCampaignTabs.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setProjectionTab(p.id)}
                      className={`text-sm font-bold pb-1 border-b-2 transition-colors ${
                        projectionTab === p.id
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 italic hidden md:block">
                  <Layers size={14} className="inline mr-1" />
                  Feuille de route Media Buyer
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs border-b">
                    <tr>
                      <th className="px-6 py-3">Client</th>
                      {projectionTab === 'all' && (
                        <th className="px-6 py-3">Campagne</th>
                      )}
                      {projectionTab !== 'all' && (
                        <th className="px-6 py-3 text-center bg-blue-50/50 text-blue-800">
                          Leads / Jour
                        </th>
                      )}
                      <th className="px-6 py-3 text-center bg-blue-50/30 text-blue-700">
                        Volume Total
                      </th>
                      {projectionTab !== 'all' && (
                        <th className="px-6 py-3 text-right">
                          Budget Quotidien
                        </th>
                      )}
                      <th className="px-6 py-3 text-right text-orange-600">
                        Budget Média (Limit)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {simulations
                      .filter(
                        (s) =>
                          projectionTab === 'all' ||
                          s.productId === projectionTab
                      )
                      .map((sim) => (
                        <tr key={sim.id} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-bold text-slate-800">
                            {sim.clientName}
                          </td>
                          {projectionTab === 'all' && (
                            <td className="px-6 py-3 text-xs">
                              {sim.productName}
                            </td>
                          )}
                          {projectionTab !== 'all' && (
                            <td className="px-6 py-3 text-center font-bold text-blue-800 bg-blue-50/30">
                              {sim.stats.dailyVolume.toFixed(1)}{' '}
                              <span className="text-[10px] text-slate-400 font-normal">
                                leads/j
                              </span>
                            </td>
                          )}
                          <td className="px-6 py-3 text-center font-bold text-lg text-blue-700">
                            {sim.stats.volumeTotal}
                          </td>
                          {projectionTab !== 'all' && (
                            <td className="px-6 py-3 text-right text-slate-600">
                              {formatCurrency(sim.stats.dailyBudget)}/j
                            </td>
                          )}
                          <td className="px-6 py-3 text-right font-mono font-bold text-orange-600">
                            {formatCurrency(sim.stats.costTotal)}
                          </td>
                        </tr>
                      ))}
                    {projectionTab !== 'all' &&
                      simulations.filter((s) => s.productId === projectionTab)
                        .length > 0 && (
                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                          <td className="px-6 py-3 font-bold uppercase text-xs text-slate-500">
                            Total Campagne
                          </td>
                          <td className="px-6 py-3 text-center font-bold text-blue-800">
                            {simulations
                              .filter((s) => s.productId === projectionTab)
                              .reduce((acc, s) => acc + s.stats.dailyVolume, 0)
                              .toFixed(1)}
                            /j
                          </td>
                          <td className="px-6 py-3 text-center font-bold text-blue-800">
                            {simulations
                              .filter((s) => s.productId === projectionTab)
                              .reduce(
                                (acc, s) => acc + s.stats.volumeTotal,
                                0
                              )}{' '}
                            leads
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-slate-700">
                            {formatCurrency(
                              simulations
                                .filter((s) => s.productId === projectionTab)
                                .reduce(
                                  (acc, s) => acc + s.stats.dailyBudget,
                                  0
                                )
                            )}
                            /j
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-orange-700">
                            {formatCurrency(
                              simulations
                                .filter((s) => s.productId === projectionTab)
                                .reduce((acc, s) => acc + s.stats.costTotal, 0)
                            )}
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: CALCULATEUR */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden mt-8">
          <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CalendarCheck className="text-blue-400" /> Calculateur de
                Campagne (35% + Arbitrage)
              </h2>
              <p className="text-slate-400 text-sm">
                Estimez la rentabilité réelle.
              </p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6 border-r border-slate-100 pr-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  1. Client
                </label>
                <select
                  value={planClientId}
                  onChange={(e) => setPlanClientId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Aucun --</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  2. Campagne
                </label>
                <select
                  value={planProductId}
                  onChange={(e) => setPlanProductId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {!planProductId && (
                    <option value="">-- Sélectionner --</option>
                  )}
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  3. Budget Client
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={planBudget}
                    onChange={(e) => setPlanBudget(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-3 pl-4 font-bold text-2xl outline-none focus:ring-2 focus:ring-blue-500 text-blue-600"
                  />
                  <span className="absolute right-4 top-4 text-sm text-slate-400 font-bold">
                    CHF
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleSaveSimulation(planStats)}
                className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors"
              >
                <Plus size={18} /> Ajouter au tableau
              </button>
            </div>
            <div className="lg:col-span-8 flex flex-col justify-center">
              {!activeProduct ? (
                <div className="text-center text-slate-400 italic py-10 flex flex-col items-center">
                  <ArrowRight className="mb-2 opacity-50" /> Sélectionner une
                  campagne.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
                    <p className="text-slate-500 text-xs font-bold uppercase mb-2">
                      Leads à Livrer
                    </p>
                    <div className="text-center py-2">
                      <span className="text-4xl font-bold text-slate-800">
                        {planStats.volumeTotal}
                      </span>
                    </div>
                    <div className="text-center border-t pt-2 mt-2 text-xs text-slate-400">
                      Budget Net Média: {formatCurrency(planBudget * 0.65)}
                    </div>
                  </div>
                  <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 relative overflow-hidden flex flex-col justify-between shadow-sm">
                    <p className="text-blue-800 text-xs font-bold uppercase mb-2">
                      Coût Réel (Vous)
                    </p>
                    <div className="text-center py-2">
                      <span className="text-3xl font-bold text-blue-700">
                        {formatCurrency(planStats.costTotal)}
                      </span>
                    </div>
                    <div className="text-center border-t border-blue-200 pt-2 mt-2">
                      <p className="text-xs text-blue-500 font-bold">
                        ~{formatCurrency(planStats.dailyBudget)} / jour
                      </p>
                    </div>
                  </div>
                  <div
                    className={`p-5 rounded-xl border flex flex-col justify-between shadow-sm ${
                      planStats.margin >= 30
                        ? 'bg-emerald-50 border-emerald-100'
                        : 'bg-orange-50 border-orange-100'
                    }`}
                  >
                    <p
                      className={`${
                        planStats.margin >= 30
                          ? 'text-emerald-800'
                          : 'text-orange-800'
                      } text-xs font-bold uppercase mb-2`}
                    >
                      Marge Nette (Poche)
                    </p>
                    <div className="text-center py-2">
                      <span
                        className={`text-3xl font-bold ${
                          planStats.margin >= 30
                            ? 'text-emerald-700'
                            : 'text-orange-700'
                        }`}
                      >
                        {formatCurrency(planStats.profit)}
                      </span>
                    </div>
                    <div className="text-center border-t border-emerald-200 pt-2 mt-2 flex justify-between px-2">
                      <p className="text-[10px] text-emerald-800">
                        Frais: {formatCurrency(planStats.fees)}
                      </p>
                      <p className="text-[10px] text-emerald-800">
                        Arb: {formatCurrency(planStats.arbitrage)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: LISTE HISTORIQUE */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Save size={20} /> Simulations Enregistrées
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
            {simulations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">
                Aucune simulation enregistrée.
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs border-b">
                  <tr>
                    <th className="px-6 py-4">Client</th>
                    <th className="px-6 py-4">Campagne</th>
                    <th className="px-6 py-4">Budget</th>
                    <th className="px-6 py-4">Volume</th>
                    <th className="px-6 py-4">Coût Réel</th>
                    <th className="px-6 py-4">Marge Nette</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {simulations
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime()
                    )
                    .map((sim) => (
                      <tr key={sim.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-bold text-blue-600">
                          {sim.clientName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-700">
                          {sim.productName}
                        </td>
                        <td className="px-6 py-4 font-mono">
                          {formatCurrency(sim.budget)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold">
                            {sim.stats.volumeTotal}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {formatCurrency(sim.stats.costTotal)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`font-bold ${
                              sim.stats.margin >= 30
                                ? 'text-emerald-600'
                                : 'text-orange-600'
                            }`}
                          >
                            {formatCurrency(sim.stats.profit)} (
                            {sim.stats.margin.toFixed(0)}%)
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDelete('simulations', sim.id)}
                            className="text-slate-300 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderContactDetail = () => {
    if (!selectedContact) return null;
    const campaign = getCampaignProgress(selectedContact.campaignStartDate);
    const clientStats = (() => {
      const paidInvoices = invoices.filter(
        (i) => i.clientId === selectedContact.id && i.status === 'payee'
      );
      const totalCA = paidInvoices.reduce(
        (sum, inv) => sum + Number(inv.amount || 0),
        0
      );
      // FIX: Arithmetic safety
      const totalCost = paidInvoices.reduce((sum, inv) => {
        return (
          sum +
          (inv.items?.reduce(
            (isum, item) => isum + Number(item.cost ?? 0) * item.qty,
            0
          ) || 0)
        );
      }, 0);
      const netProfit = totalCA - totalCost;
      const margin = totalCA > 0 ? (netProfit / totalCA) * 100 : 0;
      return {
        totalCA,
        totalCost,
        netProfit,
        margin,
        count: paidInvoices.length,
      };
    })();
    const clientInvoices = invoices
      .filter((i) => i.clientId === selectedContact.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <div className="flex flex-col h-full bg-white animate-fade-in">
        <div className="border-b px-8 py-6 flex justify-between items-start bg-slate-50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedContactId(null)}
              className="p-2 hover:bg-slate-200 rounded-full"
            >
              <ChevronLeft />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">
                {selectedContact.name}
              </h2>
              <p className="text-slate-500 flex items-center gap-2">
                <Briefcase size={14} /> {selectedContact.company}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toggleCampaign(selectedContact)}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border ${
                selectedContact.campaignStartDate
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              {selectedContact.campaignStartDate ? (
                <>
                  <StopCircle size={16} /> Arrêter
                </>
              ) : (
                <>
                  <PlayCircle size={16} /> Campagne 30j
                </>
              )}
            </button>
            <button
              onClick={() => setShowModal('interaction')}
              className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-700"
            >
              <MessageSquare size={16} /> Note
            </button>
            <button
              onClick={() => {
                setCurrentInvoice({
                  clientId: selectedContact.id,
                  clientName: selectedContact.company,
                } as any);
                if (selectedContact.projectedBudget) {
                  setInvoiceBudget(selectedContact.projectedBudget);
                  if (selectedContact.interestedProductId)
                    setInvoiceThemeId(selectedContact.interestedProductId);
                }
                setShowModal('invoice');
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700"
            >
              <FileText size={16} /> Facture
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            {/* CARD 1: INFO MODIFIABLES */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Briefcase size={18} /> Informations
                </h3>
                {!isEditingContact ? (
                  <button
                    onClick={() => {
                      setEditContactData(selectedContact);
                      setIsEditingContact(true);
                    }}
                    className="text-slate-400 hover:text-blue-600"
                  >
                    <Edit2 size={16} />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingContact(false)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveContactEdit}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      Sauvegarder
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-4 text-sm">
                {isEditingContact ? (
                  <>
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Nom"
                      value={editContactData.name || ''}
                      onChange={(e) =>
                        setEditContactData({
                          ...editContactData,
                          name: e.target.value,
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Société"
                      value={editContactData.company || ''}
                      onChange={(e) =>
                        setEditContactData({
                          ...editContactData,
                          company: e.target.value,
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Email"
                      value={editContactData.email || ''}
                      onChange={(e) =>
                        setEditContactData({
                          ...editContactData,
                          email: e.target.value,
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Téléphone"
                      value={editContactData.phone || ''}
                      onChange={(e) =>
                        setEditContactData({
                          ...editContactData,
                          phone: e.target.value,
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      type="number"
                      placeholder="Budget"
                      value={editContactData.projectedBudget || ''}
                      onChange={(e) =>
                        setEditContactData({
                          ...editContactData,
                          projectedBudget: Number(e.target.value),
                        })
                      }
                    />
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Campagne d'intérêt
                      </label>
                      <select
                        value={selectedContact.interestedProductId || ''}
                        onChange={(e) =>
                          handleUpdate('contacts', selectedContact.id, {
                            interestedProductId: e.target.value,
                          })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">-- Non défini --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-slate-500">Email</span>{' '}
                      <a
                        href={`mailto:${selectedContact.email}`}
                        className="text-blue-600 truncate"
                      >
                        {selectedContact.email}
                      </a>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-slate-500">Téléphone</span>{' '}
                      <a
                        href={`tel:${selectedContact.phone}`}
                        className="text-slate-800"
                      >
                        {selectedContact.phone || '-'}
                      </a>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-slate-500">Budget</span>
                      <span className="font-bold">
                        {formatCurrency(selectedContact.projectedBudget)}
                      </span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
                      <span
                        className={
                          campaign?.finished
                            ? 'text-red-600 font-bold'
                            : 'text-emerald-600 font-bold'
                        }
                      >
                        {campaign?.label} ({Math.round(campaign?.percent ?? 0)}
                        %)
                      </span>
                      <div>
                        <span className="text-slate-400">Marge Client: </span>
                        <span className="font-bold text-slate-700">
                          {clientStats.margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* CARD 2: FACTURES LIEES */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FileText size={18} /> Factures ({clientInvoices.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-auto">
                {clientInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded hover:bg-slate-100 cursor-pointer"
                    onClick={() => {
                      setCurrentInvoice(inv);
                      setShowModal('invoice');
                    }}
                  >
                    <span className="font-mono text-slate-500">{inv.id}</span>
                    <span className="font-bold">
                      {formatCurrency(inv.amount)}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                        INVOICE_STATUSES[inv.status].color.split(' ')[0]
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                ))}
                {clientInvoices.length === 0 && (
                  <p className="text-slate-400 italic text-sm">
                    Aucune facture.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Clock size={18} /> Activités & Notes
            </h3>
            {/* QUICK NOTE INPUT */}
            <div className="flex gap-2 mb-4">
              <input
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Écrire une note rapide..."
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddQuickNote()}
              />
              <button
                onClick={handleAddQuickNote}
                className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-700"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="space-y-4 flex-1 overflow-auto">
              {interactions
                .filter((i) => i.contactId === selectedContact.id)
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                )
                .map((i) => (
                  <div
                    key={i.id}
                    className="bg-slate-50 p-3 rounded-lg text-sm border border-slate-100 relative group"
                  >
                    <button
                      onClick={() => handleDelete('interactions', i.id)}
                      className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="flex justify-between mb-1">
                      <span className="font-bold capitalize">
                        {i.type === 'call' ? 'Appel' : 'Note'}
                      </span>{' '}
                      <span className="text-slate-400 text-xs">
                        {formatDate(i.createdAt)}
                      </span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">
                      {i.content}
                    </p>
                  </div>
                ))}
              {interactions.filter((i) => i.contactId === selectedContact.id)
                .length === 0 && (
                <p className="text-slate-400 italic text-center py-4">Vide.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-xs font-bold uppercase">
            CA ce mois
          </p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">
            {formatCurrency(stats.caMensuel)}
          </h3>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-xs font-bold uppercase">CA Total</p>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1">
            {formatCurrency(stats.caTotal)}
          </h3>
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">Campagnes & Arbitrage</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="bg-slate-50 p-4 rounded-lg border border-slate-100 relative group"
            >
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={() => {
                    setCurrentProduct(p);
                    setShowModal('product');
                  }}
                  className="p-1 text-slate-300 hover:text-blue-500"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete('products', p.id)}
                  className="p-1 text-slate-300 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="font-bold text-slate-700">{p.name}</p>
              <div className="flex justify-between mt-2 text-xs">
                <span>
                  Vente: <b>{p.price}</b>
                </span>
                <span>
                  Coût: <b>{p.cost}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h2 className="text-2xl font-bold mb-6">Paramètres</h2>
      <form
        onSubmit={handleSaveSettings}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Briefcase size={20} /> Informations Générales
          </h3>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Nom Société
            </label>
            <input
              name="companyName"
              defaultValue={settings.companyName}
              className="w-full border p-2 rounded mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Adresse Complète
            </label>
            <textarea
              name="address"
              defaultValue={settings.address}
              className="w-full border p-2 rounded mt-1 h-20"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Email Contact
            </label>
            <input
              name="email"
              defaultValue={settings.email}
              className="w-full border p-2 rounded mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Téléphone
            </label>
            <input
              name="phone"
              defaultValue={settings.phone}
              className="w-full border p-2 rounded mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Logo URL (Image)
            </label>
            <input
              name="logoUrl"
              defaultValue={settings.logoUrl}
              placeholder="https://..."
              className="w-full border p-2 rounded mt-1"
            />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <FileText size={20} /> Personnalisation Facture
          </h3>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              IBAN
            </label>
            <input
              name="iban"
              defaultValue={settings.iban}
              className="w-full border p-2 rounded mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Pied de page
            </label>
            <textarea
              name="invoiceFooter"
              defaultValue={settings.invoiceFooter}
              className="w-full border p-2 rounded mt-1 h-24"
            />
          </div>
          <div className="pt-4 flex gap-4">
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
            >
              Sauvegarder
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center text-slate-400">
        <Loader className="animate-spin mr-2" /> Chargement...
      </div>
    );
  if (!isAppAuthenticated)
    return (
      <LoginScreen
        onLogin={() => setIsAppAuthenticated(true)}
        addNotification={addNotification}
      />
    );

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans`}>
      <style>{`@media print { body * { visibility: hidden; } #invoice-printable, #invoice-printable * { visibility: visible; } #invoice-printable { position: fixed; left:0; top:0; width:100%; height:100%; padding:0; background:white; z-index:9999; } .no-print { display: none !important; } }`}</style>
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col no-print shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10 text-white">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg">
              LP
            </div>
            <div>
              <span className="font-bold block">LeadPartner</span>
              <span className="text-xs text-slate-500 uppercase">
                CRM V39 Final
              </span>
            </div>
          </div>
          <nav className="space-y-1">
            {[
              {
                id: 'dashboard',
                label: 'Tableau de bord',
                icon: LayoutDashboard,
              },
              { id: 'contacts', label: 'Contacts', icon: Users },
              { id: 'calendar', label: 'Calendrier', icon: CalendarIcon },
              { id: 'invoices', label: 'Factures', icon: FileText },
              { id: 'products', label: 'Campagnes', icon: Package },
              { id: 'projections', label: 'Projections', icon: Calculator },
              { id: 'settings', label: 'Paramètres', icon: Settings },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setSelectedContactId(null);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                  activeView === item.id
                    ? 'bg-slate-800 text-white'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <item.icon
                  size={18}
                  className={
                    activeView === item.id ? 'text-blue-400' : 'text-slate-500'
                  }
                />{' '}
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 no-print shrink-0">
          <div className="flex items-center gap-4 text-slate-400">
            <Search size={18} />
            <input
              type="text"
              placeholder="Rechercher..."
              className="bg-transparent outline-none text-sm text-slate-800 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-slate-50/50 p-6 relative">
          {selectedContact ? (
            renderContactDetail()
          ) : (
            <>
              {activeView === 'dashboard' && renderDashboard()}
              {activeView === 'calendar' && renderCalendar()}
              {activeView === 'settings' && renderSettings()}
              {activeView === 'projections' && renderProjections()}
              {activeView === 'contacts' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                  <div className="flex border-b">
                    <button
                      onClick={() => setContactFilterType('all')}
                      className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${
                        contactFilterType === 'all'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      Tous
                    </button>
                    <button
                      onClick={() => setContactFilterType('prospect')}
                      className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${
                        contactFilterType === 'prospect'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      Prospects
                    </button>
                    <button
                      onClick={() => setContactFilterType('client')}
                      className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${
                        contactFilterType === 'client'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      Clients
                    </button>
                    <div className="ml-auto p-2">
                      <button
                        onClick={() => setShowModal('contact')}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700"
                      >
                        <Plus size={16} /> Nouveau
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs border-b sticky top-0">
                        <tr>
                          <th className="px-6 py-4">Société</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Campagne</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedContacts.map((c) => {
                          const p = products.find(
                            (prod) => prod.id === c.interestedProductId
                          );
                          return (
                            <tr
                              key={c.id}
                              onClick={() => setSelectedContactId(c.id)}
                              className="hover:bg-blue-50/50 cursor-pointer group transition-colors"
                            >
                              <td className="px-6 py-4">
                                <p className="font-bold text-slate-800">
                                  {c.company}
                                </p>
                                <p className="text-slate-500 text-xs">
                                  {c.name}
                                </p>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`px-2 py-1 rounded-md text-xs font-bold border ${
                                    PIPELINE_STAGES.find(
                                      (s) => s.id === c.status
                                    )?.color
                                  }`}
                                >
                                  {PIPELINE_STAGES.find(
                                    (s) => s.id === c.status
                                  )?.label || c.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                {p ? p.name : '-'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete('contacts', c.id);
                                  }}
                                  className="text-slate-300 hover:text-red-500 p-1"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {activeView === 'invoices' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold">Factures</h3>
                    <button
                      onClick={() => {
                        setCurrentInvoice({
                          clientId: '',
                          date: new Date().toISOString(),
                          items: [],
                          status: 'brouillon',
                        });
                        setShowModal('invoice');
                      }}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center gap-2"
                    >
                      <Plus size={16} /> Créer
                    </button>
                  </div>
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs border-b">
                      <tr>
                        <th className="px-6 py-4">Client</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Montant</th>
                        <th className="px-6 py-4">Statut</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices
                        .sort(
                          (a, b) =>
                            new Date(b.date).getTime() -
                            new Date(a.date).getTime()
                        )
                        .map((inv) => (
                          <tr
                            key={inv.id}
                            className="border-b last:border-0 hover:bg-slate-50"
                          >
                            <td className="px-6 py-4 font-bold text-slate-700">
                              {inv.clientName}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {formatDate(inv.date)}
                            </td>
                            <td className="px-6 py-4 font-bold">
                              {formatCurrency(inv.amount)}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-bold ${
                                  INVOICE_STATUSES[inv.status]?.color
                                }`}
                              >
                                {INVOICE_STATUSES[inv.status]?.label ||
                                  inv.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setCurrentInvoice(inv);
                                  setShowModal('invoice');
                                }}
                                className="text-blue-600 hover:underline"
                              >
                                Ouvrir
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {activeView === 'products' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <button
                    onClick={() => setShowModal('product')}
                    className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-500 hover:text-blue-500 transition-colors h-48"
                  >
                    <Plus size={32} className="mb-2" />{' '}
                    <span className="font-bold">Ajouter Campagne</span>
                  </button>
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group"
                    >
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button
                          onClick={() => {
                            setCurrentProduct(p);
                            setShowModal('product');
                          }}
                          className="p-1 text-slate-300 hover:text-blue-500"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete('products', p.id)}
                          className="p-1 text-slate-300 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="absolute top-4 left-4 bg-slate-100 p-1.5 rounded-md text-slate-500">
                        {p.platform === 'google' ? (
                          <Globe size={16} />
                        ) : (
                          <Share2 size={16} />
                        )}
                      </div>
                      <h4 className="font-bold text-slate-800 text-lg mb-2 mt-6">
                        {p.name}
                      </h4>
                      <p className="text-slate-500 text-sm mb-4 h-10 line-clamp-2">
                        {p.description || 'Aucune description'}
                      </p>
                      <div className="flex justify-between items-end border-t pt-4">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">
                            Prix Vente
                          </p>
                          <p className="font-bold text-xl text-blue-600">
                            {formatCurrency(p.price)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-bold">
                            Coût Achat (Est.)
                          </p>
                          <p className="font-bold text-lg text-slate-600">
                            {formatCurrency(p.cost)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {/* NOTIFICATIONS */}
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[1000] no-print">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-xl shadow-lg border flex items-center gap-3 min-w-[300px] animate-fade-in ${
                n.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : n.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              {n.type === 'success' ? (
                <CheckCircle size={20} />
              ) : n.type === 'error' ? (
                <AlertTriangle size={20} />
              ) : (
                <Info size={20} />
              )}
              <p className="font-medium text-sm">{n.message}</p>
            </div>
          ))}
        </div>

        {/* CONFIRMATION MODAL */}
        {confirmState.isOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600 mx-auto">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-xl font-bold text-center mb-2">
                {confirmState.title}
              </h3>
              <p className="text-slate-500 text-center text-sm mb-6">
                {confirmState.message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    setConfirmState((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmState.onConfirm}
                  className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {showModal === 'contact' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Ajouter une personne</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                handleCreate('contacts', {
                  name: fd.get('name'),
                  company: fd.get('company'),
                  email: fd.get('email'),
                  phone: fd.get('phone'),
                  status: fd.get('status'),
                });
              }}
              className="space-y-4"
            >
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex gap-2">
                <select
                  name="status"
                  className="w-full bg-transparent font-bold text-slate-700 outline-none p-1"
                >
                  <option value="nouveau">👤 Prospect (En cours)</option>
                  <option value="gagne">✅ Client (Gagné)</option>
                </select>
              </div>
              <input
                name="company"
                required
                className="w-full border p-3 rounded-lg"
                placeholder="Nom de la Société"
              />
              <input
                name="name"
                required
                className="w-full border p-3 rounded-lg"
                placeholder="Nom du Contact (Ex: Jean Dupont)"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  name="email"
                  type="email"
                  className="w-full border p-3 rounded-lg"
                  placeholder="Email"
                />
                <input
                  name="phone"
                  className="w-full border p-3 rounded-lg"
                  placeholder="Téléphone"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showModal === 'product' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-6">
              {currentProduct ? 'Modifier Campagne' : 'Nouvelle Campagne'}
            </h3>
            <form onSubmit={handleSaveProductForm} className="space-y-4">
              <input
                name="name"
                defaultValue={currentProduct?.name}
                required
                placeholder="Nom (ex: 3ème Pilier)"
                className="w-full border p-3 rounded-lg"
              />
              <textarea
                name="description"
                defaultValue={currentProduct?.description}
                placeholder="Description courte"
                className="w-full border p-3 rounded-lg h-20"
              ></textarea>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Prix Vente (CHF)
                  </label>
                  <input
                    name="price"
                    defaultValue={currentProduct?.price}
                    type="number"
                    step="0.01"
                    required
                    className="w-full border p-3 rounded-lg mt-1"
                    placeholder="80.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Coût Achat Cible
                  </label>
                  <input
                    name="cost"
                    defaultValue={currentProduct?.cost}
                    type="number"
                    step="0.01"
                    required
                    className="w-full border p-3 rounded-lg mt-1"
                    placeholder="25.00"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">
                  Plateforme Pub
                </label>
                <select
                  name="platform"
                  defaultValue={currentProduct?.platform}
                  className="w-full border p-3 rounded-lg mt-1"
                >
                  <option value="meta">Meta Ads (Facebook/Insta)</option>
                  <option value="google">Google Ads</option>
                  <option value="tiktok">TikTok Ads</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(null);
                    setCurrentProduct(null);
                  }}
                  className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold"
                >
                  {currentProduct ? 'Mettre à jour' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showModal === 'invoice' && currentInvoice && (
        <div className="fixed inset-0 bg-slate-900/95 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[95vh] rounded-xl flex flex-col shadow-2xl overflow-hidden">
            <div className="h-16 border-b flex justify-between items-center px-6 bg-slate-50 no-print shrink-0">
              <h3 className="font-bold text-lg">Facture {currentInvoice.id}</h3>
              <div className="flex gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-200 rounded-lg flex gap-2 items-center"
                >
                  <Printer size={16} /> Imprimer
                </button>
                <button
                  onClick={handleSaveInvoice}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg flex gap-2 items-center"
                >
                  <CheckCircle size={16} /> Sauvegarder
                </button>
                <button
                  onClick={() => setShowModal(null)}
                  className="p-2 hover:bg-red-50 text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-200/50 p-8 flex justify-center">
              <div
                id="invoice-printable"
                className="bg-white w-[21cm] min-h-[29.7cm] shadow-xl p-[2.5cm] flex flex-col text-slate-800 relative"
              >
                <div className="flex justify-between mb-12">
                  <div>
                    <h1
                      className="text-4xl font-bold uppercase mb-2"
                      style={{ color: settings.primaryColor }}
                    >
                      Facture
                    </h1>
                    <p className="font-mono">
                      #{currentInvoice.id || 'BROUILLON'}
                    </p>
                    <p className="text-sm mt-1">
                      Date: {formatDate(currentInvoice.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    {settings.logoUrl && (
                      <img
                        src={settings.logoUrl}
                        className="h-16 mb-2 ml-auto object-contain"
                        alt="Logo"
                      />
                    )}
                    <p className="font-bold text-lg">{settings.companyName}</p>
                    <p className="text-sm text-slate-500 whitespace-pre-wrap">
                      {settings.address}
                    </p>
                    <p className="text-sm text-slate-500">
                      {settings.email} • {settings.phone}
                    </p>
                  </div>
                </div>
                <div className="mb-8">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">
                    Facturé à
                  </p>
                  {currentInvoice.id ? (
                    <div className="font-bold text-lg">
                      {currentInvoice.clientName}
                    </div>
                  ) : (
                    <select
                      className="bg-slate-50 border p-2 rounded w-full font-bold no-print"
                      onChange={(e) => {
                        const c = contacts.find(
                          (co) => co.id === e.target.value
                        );
                        setCurrentInvoice({
                          ...currentInvoice,
                          clientId: c?.id,
                          clientName: c?.company,
                          projectedBudget: c?.projectedBudget,
                          interestedProductId: c?.interestedProductId,
                        } as any);
                        if (c?.projectedBudget) {
                          setInvoiceBudget(c.projectedBudget);
                          if (c.interestedProductId)
                            setInvoiceThemeId(c.interestedProductId);
                        }
                      }}
                      value={currentInvoice.clientId}
                    >
                      <option value="">-- Sélectionner Client --</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company}
                        </option>
                      ))}
                    </select>
                  )}
                  {currentInvoice.clientName && !currentInvoice.id && (
                    <div className="font-bold text-lg mt-1">
                      {currentInvoice.clientName}
                    </div>
                  )}
                </div>

                {/* GENERATEUR LEADGEN FLEXIBLE (V20) */}
                {!currentInvoice.id && (
                  <div className="no-print bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8">
                    <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                      <Wand2 size={16} /> Générateur LeadGen
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                          Budget Total
                        </label>
                        <input
                          type="number"
                          value={invoiceBudget}
                          onChange={(e) => setInvoiceBudget(e.target.value)}
                          className="w-full border p-2 rounded font-bold"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                          Thématique
                        </label>
                        <select
                          value={invoiceThemeId}
                          onChange={(e) => setInvoiceThemeId(e.target.value)}
                          className="w-full border p-2 rounded"
                        >
                          <option value="">-- Choisir --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                          Marge Agence (%)
                        </label>
                        <input
                          type="number"
                          value={invoiceMarginPercent}
                          onChange={(e) =>
                            setInvoiceMarginPercent(Number(e.target.value))
                          }
                          className="w-full border p-2 rounded text-blue-600 font-bold"
                        />
                      </div>
                      <button
                        onClick={handleGenerateInvoice}
                        className="bg-slate-900 text-white px-4 py-2 rounded font-bold hover:bg-slate-700"
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                )}

                <table className="w-full mb-8">
                  <thead>
                    <tr className="border-b-2 border-slate-900 text-sm">
                      <th className="text-left py-3 font-bold uppercase w-3/4">
                        Description
                      </th>
                      <th className="text-right py-3 font-bold uppercase">
                        Montant
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentInvoice.items || []).map((item, i) => (
                      <tr key={i} className="border-b border-slate-100 group">
                        <td className="py-4">{item.name}</td>
                        <td className="py-4 text-right font-bold text-lg font-mono">
                          {formatCurrency(item.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end mt-auto">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-slate-500">
                      <span>Total HT</span>{' '}
                      <span>
                        {formatCurrency(
                          (currentInvoice.items || []).reduce(
                            (acc, i) => acc + i.price * i.qty,
                            0
                          )
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>TVA (0.0%)</span> <span>0.00 CHF</span>
                    </div>
                    <div className="flex justify-between py-4 border-t-2 border-slate-900 text-2xl font-bold">
                      <span>Total TTC</span>{' '}
                      <span>
                        {formatCurrency(
                          (currentInvoice.items || []).reduce(
                            (acc, i) => acc + i.price * i.qty,
                            0
                          )
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-12 pt-8 border-t text-center text-xs text-slate-400">
                  {settings.iban && (
                    <p className="font-bold text-slate-600 mb-1">
                      IBAN: {settings.iban}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">
                    {settings.invoiceFooter}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
