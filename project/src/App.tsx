import { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardLayout, type PageKey } from '@/components/DashboardLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { CandidatesPage } from '@/pages/CandidatesPage';
import { CandidateDetailPage } from '@/pages/CandidateDetailPage';
import { ImportPage } from '@/pages/ImportPage';
import { ChaseCentrePage } from '@/pages/ChaseCentrePage';
import { DoNotBookPage } from '@/pages/DoNotBookPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { Spinner } from '@/components/ui/EmptyState';
import { StatusPopup } from '@/components/StatusPopup';

function AppContent() {
  const { session, loading } = useAuth();
  const [page, setPage] = useState<PageKey>('dashboard');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [editCandidateId, setEditCandidateId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  const handleNavigate = (p: PageKey) => {
    setPage(p);
    setSelectedCandidateId(null);
    setEditCandidateId(null);
  };

  const handleSelectCandidate = (id: string) => {
    setSelectedCandidateId(id);
  };

  const handleEditCandidate = (id: string) => {
    setEditCandidateId(id);
    setPage('edit-candidate');
  };

  return (
    <DashboardLayout current={page} onNavigate={handleNavigate}>
      <StatusPopup />
      {page === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {page === 'candidates' &&
        (selectedCandidateId ? (
          <CandidateDetailPage candidateId={selectedCandidateId} onBack={() => handleNavigate('candidates')} onEdit={handleEditCandidate} />
        ) : (
          <CandidatesPage onSelectCandidate={handleSelectCandidate} onEdit={handleEditCandidate} />
        ))}
      {page === 'import' && <ImportPage onNavigate={handleNavigate} />}
      {page === 'edit-candidate' && (
        <CandidateDetailPage
          candidateId={editCandidateId ?? selectedCandidateId ?? ''}
          onBack={() => handleNavigate('candidates')}
          onEdit={handleEditCandidate}
          editMode
        />
      )}
      {page === 'chase-centre' && <ChaseCentrePage onEdit={handleEditCandidate} />}
      {page === 'do-not-book' && <DoNotBookPage onEdit={handleEditCandidate} />}
      {page === 'history' && <HistoryPage />}
      {page === 'reports' && <ReportsPage />}
      {page === 'settings' && <SettingsPage />}
    </DashboardLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
