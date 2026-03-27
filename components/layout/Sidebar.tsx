import React, { useState } from 'react';
import { Page } from '../../types';
import { useShowrunnerStore } from '../../store/showrunnerStore';
import {
  LayoutDashboard, BookOpen, FileText, GalleryHorizontal, Clapperboard, Settings, Music, ChevronLeft, ChevronRight
} from 'lucide-react';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}

const navItems = [
  { name: 'Dashboard' as Page, icon: LayoutDashboard },
  { name: 'Scriptwriter' as Page, icon: FileText },
  { name: 'Story Bible' as Page, icon: BookOpen },
  { name: 'Art Dept' as Page, icon: GalleryHorizontal },
  { name: 'Sound Stage' as Page, icon: Music },
  { name: 'The Studio' as Page, icon: Clapperboard },
];

const settingsNav = { name: 'Settings' as Page, icon: Settings };

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
  const project = useShowrunnerStore((state) => state.project);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-60'} bg-surface border-r border-subtle flex flex-col p-4 transition-all duration-300 relative`}>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-6 bg-surface border border-subtle rounded-full p-1 text-muted hover:text-primary-text z-10"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`flex items-center gap-3 mb-8 px-2 ${isCollapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 bg-primary rounded-md shrink-0"></div>
        {!isCollapsed && <h1 className="text-xl font-bold text-primary truncate">Showrunner</h1>}
      </div>
      <nav className="flex-grow">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isEnabled = project || item.name === 'Dashboard';
            const isActive = currentPage === item.name;
            return (
              <li key={item.name}>
                <button
                  onClick={() => isEnabled && setCurrentPage(item.name)}
                  disabled={!isEnabled}
                  title={isCollapsed ? item.name : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-panel text-primary'
                      : 'text-muted hover:bg-panel hover:text-primary-text'
                  } ${!isEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div>
        <ul>
          <li>
            <button
              onClick={() => setCurrentPage(settingsNav.name)}
              title={isCollapsed ? settingsNav.name : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                currentPage === 'Settings'
                  ? 'bg-panel text-primary'
                  : 'text-muted hover:bg-panel hover:text-primary-text'
              } ${isCollapsed ? 'justify-center' : ''}`}
            >
              <settingsNav.icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="truncate">{settingsNav.name}</span>}
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
};

export default Sidebar;