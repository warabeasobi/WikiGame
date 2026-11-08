import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ModePage } from './pages/ModePage';
import { RacePage } from './pages/RacePage';
import { ResultPage } from './pages/ResultPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProfileProvider } from './state/profile';
import { RaceProvider } from './state/race';

export function App() {
  return (
    <ProfileProvider>
      <RaceProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/mode" element={<ModePage />} />
              <Route path="/balapan" element={<RacePage />} />
              <Route path="/hasil" element={<ResultPage />} />
              <Route path="/profil" element={<ProfilePage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Layout>
        </HashRouter>
      </RaceProvider>
    </ProfileProvider>
  );
}
