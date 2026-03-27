
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { debounce } from 'lodash-es';
import { 
  Project, GeminiModel, Season, Sequel, Episode, Act, 
  Scene, Shot, Character, Location, Prop, ContinuityBrief, 
  CharacterProfile, AssetType, ConsistencyMode, ScreenplayItem, AssetAnalysisResult,
  StateSnapshot, LocationBaseProfile, PropBaseProfile, ShotReferenceImage,
  SceneHistoryEntry, AIModelConfig, UserProfile, Asset, ProjectFormat, ProjectStyle, UsageStats
} from '../types';
import { saveProjectToDB, loadProjectFromDB, selectAndLoadProjectFile, selectAndLoadBible, selectAndLoadScript, selectAndLoadStudio, selectAndLoadArtDept } from '../services/storageService';
import { migrateProjectImages } from '../services/migrationService';
import { geminiService } from '../services/geminiService';
import { modelGateway } from '../services/modelGateway';

const debouncedSave = debounce((project: Project) => {
    saveProjectToDB(project);
}, 2000);

const createDefaultCharacterProfile = (name: string): CharacterProfile => ({
    name,
    coreIdentity: { name, primaryNarrativeRole: 'Unknown', fullLegalName: { first: '', middle: '', last: '' }, nicknamesAliases: [], titleHonorific: '', secondarySupportingRoles: [], characterArchetypes: [] },
    persona: { backstory: { keyChildhoodEvents: [], keyAdultEvents: [], familyDynamics: '' }, motivations: { externalGoal: '', internalNeed: '', coreDrive: '' }, fears: { surfaceFear: '', deepFear: '' } },
    vocationalProfile: { currentOccupation: '', pastOccupations: [], hardSkills: [], softSkills: [], expertiseLevel: '', credentialsAwards: [] },
    visualDna: { species: '', gender: '', age: { chronological: null, apparent: '' }, ethnicCulturalBackground: { ethnicity: '', nationalityRegion: '' }, eyes: { color: '', shape: '' }, hair: { color: '', texture: '', styleCut: '' }, buildPhysique: { height: '', weightFrame: '', posture: '', distinctiveTraits: [] }, uniqueIdentifiers: { scars: [], tattoos: [], other: { birthmarks: '', piercings: [], prosthetics: '' } } },
    outfitMatrix: { signatureLook: { headwear: '', tops: '', bottoms: '', footwear: '', accessories: [] }, contextSpecificVariants: { combatAction: { description: '', notes: '' }, formalCeremonial: { description: '', notes: '' }, incognitoCasual: { description: '', notes: '' }, weatherSpecific: { description: '', notes: '' } } },
    vocalProfile: { speakingPersona: '', timbre: '', pitchRange: '', speechPatterns: '', pacing: '', accentDialect: '', languageFluency: { native: [], learned: [], codeSwitching: false }, voiceNotes: { timbreDescription: '', pitchNotes: '', emotionCaptured: '', accentMarkers: '', deliveryStyle: '' } },
    catchphrases: { publicTagline: '', privateMantra: '', quotationNotes: { contextsUsed: '', frequency: '', originStory: '' } },
    additionalNotes: { moodBoard: { overallAesthetic: '', colorPalette: '', atmosphere: '' }, characterTimeline: { keyDates: [], arcProgression: '', flashbackTriggers: '' }, relationshipMap: { connectionTypes: '', tensionLevels: '', secrets: '' }, locationSetting: { keyPlaces: [], emotionalAssociations: '', frequencyOfVisits: '' }, researchNotes: { historicalEra: '', culturalDeepDive: '', techSpecs: '' }, miscellaneous: { playlist: '', fanArtInspiration: '', deletedScenes: '' } }
});

const createDefaultLocationBaseProfile = (name: string): LocationBaseProfile => ({
    identity: { name },
    narrative: { description: '', vibe: '' },
    visuals: { architectureStyle: '', keyElements: [], lighting: '', visualPrompt: '' },
    audioProfile: { voiceIdentity: { timbre: '', pitch: '' }, speechPatterns: { pacing: '', idioms: [] }, signatureSounds: [], quirks: [] }
});

const createDefaultPropBaseProfile = (name: string): PropBaseProfile => ({
    identity: { name },
    narrative: { description: '' },
    visuals: { material: '', era: '', markings: [], visualPrompt: '' },
    audioProfile: { voiceIdentity: { timbre: '', pitch: '' }, speechPatterns: { pacing: '', idioms: [] }, signatureSounds: [], quirks: [] }
});

// Helper to add history
const addHistoryEntry = (item: Episode | Act, actionType: SceneHistoryEntry['actionType'], description: string, scenes: Scene[]): SceneHistoryEntry[] => {
    const currentHistory = item.sceneHistory || [];
    const newEntry: SceneHistoryEntry = {
        id: uuidv4(),
        timestamp: Date.now(),
        actionType,
        description,
        snapshot: JSON.parse(JSON.stringify(scenes)) // Deep copy
    };
    // Keep last 30 entries
    return [newEntry, ...currentHistory].slice(0, 30);
};

const updateItemById = (item: Episode | Act, itemId: string, updates: Partial<Episode | Act> | ((item: Episode | Act) => Episode | Act)): Episode | Act => {
    if (item.id === itemId) {
        if (typeof updates === 'function') return updates(item);
        return { ...item, ...updates };
    }
    if ('acts' in item && item.acts) {
        return { ...item, acts: item.acts.map(a => updateItemById(a, itemId, updates) as Act) };
    }
    return item;
};

const getStoredKey = (provider: string) => localStorage.getItem(`apikey_${provider}`) || '';

interface ShowrunnerState {
  project: Project | null;
  isLoaded: boolean;
  generationModel: GeminiModel;
  lastMovedSceneId: string | null; // For UI highlighting
  
  // Model Gateway State
  availableModels: AIModelConfig[];
  customModels: AIModelConfig[];
  apiKeys: Record<string, string>;
  user: UserProfile | null;
  usageStats: UsageStats;
  isGeneratingGlobal: boolean;
  globalGenerationTask: string | null;

  // Lifecycle
  setProject: (project: Project) => void;
  createNewProject: (params: { name: string; logline: string; format: ProjectFormat; style: ProjectStyle; supportingText?: string }) => void;
  updateProject: (updates: Partial<Project>) => void;
  updateProjectName: (name: string) => void;
  closeProject: () => void;
  loadAutosave: () => void;
  importProject: () => void;
  importBible: () => void;
  importScript: () => void;
  importStudio: () => void; 
  importArtDept: () => void;

  setGenerationModel: (model: GeminiModel) => void;
  updateSynopsis: (synopsis: string) => void;
  setGeneratedStructure: (items: (Episode | Act)[]) => void;
  populateCharacterProfile: (id: string, profile: CharacterProfile) => void;
  populateLocationProfile: (id: string, baseProfile: LocationBaseProfile) => void;
  populatePropProfile: (id: string, baseProfile: PropBaseProfile) => void;
  updateCharacter: (updates: Partial<Character> & { id: string }) => void;
  updateLocation: (updates: Partial<Location> & { id: string }) => void;
  updateProp: (updates: Partial<Prop> & { id: string }) => void;
  updateAssetConsistency: (type: AssetType, id: string, mode: ConsistencyMode) => void;
  addSeason: () => void;
  deleteSeason: (id: string) => void;
  addSequel: () => void;
  deleteSequel: (id: string) => void;
  toggleInstallmentLock: (id: string) => void;
  updateContinuityBrief: (installmentId: string, updates: Partial<ContinuityBrief>) => void;
  addEpisodeToSeason: (seasonId: string, params: { title: string; logline: string }) => void;
  addActToSequel: (sequelId: string, params: { title: string; summary: string }) => void;
  addActToEpisode: (seasonId: string, episodeId: string, params: { title: string; summary: string }) => void;
  updateEpisode: (id: string, updates: Partial<Episode>) => void;
  updateAct: (id: string, updates: Partial<Act>) => void;
  updateActInEpisode: (seasonId: string, episodeId: string, actId: string, updates: Partial<Act>) => void;
  deleteEpisodeFromSeason: (seasonId: string, episodeId: string) => void;
  deleteActFromSequel: (sequelId: string, actId: string) => void;
  deleteActFromEpisode: (seasonId: string, episodeId: string, actId: string) => void;
  initializeActsForEpisode: (seasonId: string, episodeId: string) => void;
  setActsForEpisode: (seasonId: string, episodeId: string, acts: { title: string; summary: string }[]) => void;
  setScenesForItem: (itemId: string, scenes: Scene[]) => void; 
  updateSceneSummary: (itemId: string, sceneId: string, summary: string) => void;
  lockSceneSummaries: (itemId: string) => void;
  toggleSceneContentLock: (itemId: string, sceneId: string) => void;
  setAllScreenplaysForItem: (itemId: string, result: { scenes: { sceneId: string; screenplay: ScreenplayItem[] }[] }) => void;
  approveEpisodeActScreenplay: (itemId: string) => void;
  addScreenplayLine: (itemId: string, sceneId: string, index: number, type: ScreenplayItem['type']) => void;
  updateScreenplayLine: (itemId: string, sceneId: string, index: number, text: string) => void;
  deleteScreenplayLine: (itemId: string, sceneId: string, index: number) => void;
  setAnalyzedAssets: (itemId: string, result: AssetAnalysisResult) => void;
  addShot: (sceneId: string) => void;
  updateShot: (sceneId: string, shotId: string, updates: Partial<Shot>) => void;
  deleteShot: (sceneId: string, shotId: string) => void;
  addScene: (itemId: string) => void;
  deleteScene: (itemId: string, sceneId: string) => void;
  reorderScenes: (itemId: string, newScenes: Scene[]) => void;
  revertSceneHistory: (itemId: string, historyId: string) => void;
  revertToInitial: (itemId: string) => void;
  undoSceneAction: (itemId: string) => void;
  redoSceneAction: (itemId: string) => void;
  clearLastMovedSceneId: () => void;
  autoPopulateStoryBible: (model?: GeminiModel) => Promise<{ success: boolean; failedAssets: { id: string; name: string; type: AssetType }[] }>;
  generateShotsForScene: (sceneId: string) => Promise<void>;
  updateApiKey: (provider: string, key: string) => void;
  addCustomModel: (model: AIModelConfig) => void;
  removeCustomModel: (id: string) => void;
  fetchModels: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  setGenerating: (isGenerating: boolean, taskName?: string | null) => void;
  generateSynopsisGlobal: (model: GeminiModel) => Promise<void>;
  generateInitialStructureGlobal: (model: GeminiModel) => Promise<void>;
  
  recordUsage: (modelId: string, resolution?: string) => void;
  resetUsage: () => void;
  logout: () => void;
}

export const useShowrunnerStore = create<ShowrunnerState>((set, get) => ({
  project: null,
  isLoaded: false,
  generationModel: 'gemini-3.1-flash-lite-preview',
  lastMovedSceneId: null,
  availableModels: [],
  customModels: JSON.parse(localStorage.getItem('custom_models') || '[]'),
  usageStats: (() => {
    const stored = localStorage.getItem('usage_stats');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && 'modelCounts' in parsed) {
            return parsed;
        }
      } catch (e) { console.error("Failed to parse usage stats", e); }
    }
    return {
      modelCounts: {},
      lastResetDate: new Date().toISOString().split('T')[0]
    };
  })(),
  isGeneratingGlobal: false,
  globalGenerationTask: null,
  apiKeys: {
      'google_native': localStorage.getItem('gemini_api_key') || '',
      'kie': getStoredKey('kie'),
      'wavespeed': getStoredKey('wavespeed'),
      'openai_compatible': getStoredKey('openai_compatible')
  },
  user: JSON.parse(localStorage.getItem('user_profile') || 'null'),

  setProject: (project) => {
    set({ project, isLoaded: true });
    debouncedSave(project);
  },

  createNewProject: ({ name, logline, format, style, supportingText }: { name: string; logline: string; format: ProjectFormat; style: ProjectStyle; supportingText?: string }) => {
    // Treat all new formats as 'sequels' (single story structure) unless explicit EPISODIC
    const isEpisodic = format.type === 'EPISODIC';
    
    const newProject: Project = {
      metadata: {
        id: uuidv4(),
        name,
        author: 'User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      logline,
      format,
      style,
      supportingText,
      bible: {
        synopsis: '',
        characters: [],
        locations: [],
        props: [],
        lore: {},
      },
      script: {
        seasons: isEpisodic ? [] : undefined,
        sequels: !isEpisodic ? [] : undefined,
      },
      art: {},
      studio: {
        shotsByScene: {},
      },
    };
    get().setProject(newProject);
  },

  updateProject: (updates) => {
    set((state) => {
      if (!state.project) return {};
      const updatedProject = { ...state.project, ...updates, metadata: { ...state.project.metadata, updatedAt: Date.now() } };
      debouncedSave(updatedProject);
      return { project: updatedProject };
    });
  },

  updateProjectName: (name) => {
    set((state) => {
        if (!state.project) return {};
        const updatedProject = { ...state.project, metadata: { ...state.project.metadata, name, updatedAt: Date.now() } };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  closeProject: () => {
    set({ project: null });
  },

  loadAutosave: async () => {
    // 1. Fetch Remote Models
    await get().fetchModels();

    // 2. Load Project
    let project = await loadProjectFromDB();
    if (project) {
        project = await migrateProjectImages(project);
        set({ project, isLoaded: true });
        saveProjectToDB(project);
    } else {
        set({ isLoaded: true });
    }
  },

  importProject: async () => {
      const project = await selectAndLoadProjectFile();
      if (project) {
          const migrated = await migrateProjectImages(project);
          set({ project: migrated, isLoaded: true });
          debouncedSave(migrated);
      }
  },

  importBible: async () => {
      const bible = await selectAndLoadBible();
      if (bible) {
          const { project, updateProject } = get();
          if (project) updateProject({ bible });
      }
  },

  importScript: async () => {
      const script = await selectAndLoadScript();
      if (script) {
          const { project, updateProject } = get();
          if (project) updateProject({ script });
      }
  },

  importStudio: async () => {
      const studio = await selectAndLoadStudio();
      if (studio) {
          const { project, updateProject } = get();
          if (project) updateProject({ studio });
      }
  },

  importArtDept: async () => {
      const bible = await selectAndLoadArtDept();
      if (bible) {
           const { project, updateProject } = get();
           if (project) updateProject({ bible });
      }
  },

  setGenerationModel: (model) => set({ generationModel: model }),

  updateSynopsis: (synopsis) => {
    set((state) => {
        if (!state.project) return {};
        const updatedProject = {
            ...state.project,
            bible: { ...state.project.bible, synopsis }
        };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  setGeneratedStructure: (items) => {
      set((state) => {
          if (!state.project) return {};
          const isEpisodic = state.project.format.type === 'EPISODIC';
          let seasons = state.project.script.seasons;
          let sequels = state.project.script.sequels;

          if (isEpisodic) {
              const season: Season = {
                  id: uuidv4(),
                  seasonNumber: 1,
                  title: "Season 1",
                  logline: state.project.bible.synopsis || "",
                  continuityBrief: undefined,
                  episodes: items as Episode[],
                  isLocked: false
              };
              seasons = [season];
          } else {
              const sequel: Sequel = {
                  id: uuidv4(),
                  partNumber: 1,
                  title: "Part 1",
                  summary: state.project.bible.synopsis || "",
                  continuityBrief: undefined,
                  acts: items as Act[],
                  isLocked: false
              };
              sequels = [sequel];
          }

          const updatedProject = {
              ...state.project,
              script: {
                  seasons: isEpisodic ? seasons : undefined,
                  sequels: !isEpisodic ? sequels : undefined,
              }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  populateCharacterProfile: (id, profile) => {
      set((state) => {
          if (!state.project) return {};
          const chars = state.project.bible.characters.map(c => 
             c.id === id ? { ...c, profile } : c
          );
          const updatedProject = {
              ...state.project,
              bible: { ...state.project.bible, characters: chars }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  populateLocationProfile: (id, baseProfile) => {
      set((state) => {
          if (!state.project) return {};
          const locs = state.project.bible.locations.map(l => 
             l.id === id ? { ...l, baseProfile } : l
          );
          const updatedProject = {
              ...state.project,
              bible: { ...state.project.bible, locations: locs }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  populatePropProfile: (id, baseProfile) => {
      set((state) => {
          if (!state.project) return {};
          const props = state.project.bible.props.map(p => 
             p.id === id ? { ...p, baseProfile } : p
          );
          const updatedProject = {
              ...state.project,
              bible: { ...state.project.bible, props }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  updateCharacter: (updates) => {
      set((state) => {
          if (!state.project) return {};
          const chars = state.project.bible.characters.map(c => 
             c.id === updates.id ? { ...c, ...updates } : c
          );
          const updatedProject = {
              ...state.project,
              bible: { ...state.project.bible, characters: chars }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  updateLocation: (updates) => {
    set((state) => {
        if (!state.project) return {};
        const locs = state.project.bible.locations.map(l => 
           l.id === updates.id ? { ...l, ...updates } : l
        );
        const updatedProject = {
            ...state.project,
            bible: { ...state.project.bible, locations: locs }
        };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  updateProp: (updates) => {
    set((state) => {
        if (!state.project) return {};
        const props = state.project.bible.props.map(p => 
           p.id === updates.id ? { ...p, ...updates } : p
        );
        const updatedProject = {
            ...state.project,
            bible: { ...state.project.bible, props }
        };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  updateAssetConsistency: (type, id, mode) => {
    set((state) => {
        if (!state.project) return {};
        const updateList = <T extends { id: string, consistencyMode: ConsistencyMode }>(list: T[]) => 
            list.map(item => item.id === id ? { ...item, consistencyMode: mode } : item);

        const bible = { ...state.project.bible };
        if (type === 'character') bible.characters = updateList(bible.characters);
        if (type === 'location') bible.locations = updateList(bible.locations);
        if (type === 'prop') bible.props = updateList(bible.props);

        const updatedProject = { ...state.project, bible };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  addSeason: () => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const nextNum = state.project.script.seasons.length + 1;
          const newSeason: Season = {
              id: uuidv4(),
              seasonNumber: nextNum,
              title: `Season ${nextNum}`,
              logline: '',
              episodes: [],
              isLocked: false
          };
          const updatedProject = {
              ...state.project,
              script: { ...state.project.script, seasons: [...state.project.script.seasons, newSeason] }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  deleteSeason: (id) => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const updatedSeasons = state.project.script.seasons.filter(s => s.id !== id);
          const renumbered = updatedSeasons.map((s, i) => ({ ...s, seasonNumber: i + 1, title: `Season ${i+1}` }));
          const updatedProject = {
              ...state.project,
              script: { ...state.project.script, seasons: renumbered }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  addSequel: () => {
    set(state => {
        if (!state.project || !state.project.script.sequels) return {};
        const nextNum = state.project.script.sequels.length + 1;
        const newSequel: Sequel = {
            id: uuidv4(),
            partNumber: nextNum,
            title: `Part ${nextNum}`,
            summary: '',
            acts: [],
            isLocked: false
        };
        const updatedProject = {
            ...state.project,
            script: { ...state.project.script, sequels: [...state.project.script.sequels, newSequel] }
        };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  deleteSequel: (id) => {
      set(state => {
          if (!state.project || !state.project.script.sequels) return {};
          const updatedSequels = state.project.script.sequels.filter(s => s.id !== id);
          const renumbered = updatedSequels.map((s, i) => ({ ...s, partNumber: i + 1, title: `Part ${i+1}` }));
          const updatedProject = {
              ...state.project,
              script: { ...state.project.script, sequels: renumbered }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  toggleInstallmentLock: (id) => {
      set(state => {
          if (!state.project) return {};
          const isEpisodic = state.project.format.type === 'EPISODIC';
          let updatedProject;
          if (isEpisodic) {
               const seasons = state.project.script.seasons?.map(s => s.id === id ? { ...s, isLocked: !s.isLocked } : s);
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
               const sequels = state.project.script.sequels?.map(s => s.id === id ? { ...s, isLocked: !s.isLocked } : s);
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  updateContinuityBrief: (installmentId, updates) => {
      set(state => {
        if (!state.project) return {};
        const updateInstallment = (inst: Season | Sequel) => {
            if (inst.id !== installmentId) return inst;
            const existingBrief = inst.continuityBrief || {
                id: uuidv4(),
                projectId: state.project!.metadata.id,
                installmentId: inst.id,
                installmentTitle: inst.title,
                generatedAt: Date.now(),
                summary: '',
                characterResolutions: [],
                worldStateChanges: [],
                lingeringHooks: [],
                isLocked: false
            };
            return { ...inst, continuityBrief: { ...existingBrief, ...updates } };
        };
        const isEpisodic = state.project.format.type === 'EPISODIC';
        let updatedProject;
        if (isEpisodic) {
             const seasons = state.project.script.seasons?.map(updateInstallment as (s: Season) => Season);
             updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
        } else {
             const sequels = state.project.script.sequels?.map(updateInstallment as (s: Sequel) => Sequel);
             updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        }
        debouncedSave(updatedProject);
        return { project: updatedProject };
      });
  },

  addEpisodeToSeason: (seasonId, { title, logline }) => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const seasons = state.project.script.seasons.map(season => {
              if (season.id !== seasonId) return season;
              const nextNum = season.episodes.length + 1;
              const acts: Act[] = [
                  { id: uuidv4(), actNumber: 1, title: 'Act 1', summary: 'Setup', scenes: [], sceneSummariesLocked: false },
                  { id: uuidv4(), actNumber: 2, title: 'Act 2', summary: 'Confrontation', scenes: [], sceneSummariesLocked: false },
                  { id: uuidv4(), actNumber: 3, title: 'Act 3', summary: 'Resolution', scenes: [], sceneSummariesLocked: false },
              ];
              const newEpisode: Episode = { id: uuidv4(), episodeNumber: nextNum, title, logline, scenes: [], acts, sceneSummariesLocked: false };
              return { ...season, episodes: [...season.episodes, newEpisode] };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  addActToSequel: (sequelId, { title, summary }) => {
    set(state => {
        if (!state.project || !state.project.script.sequels) return {};
        const sequels = state.project.script.sequels.map(sequel => {
            if (sequel.id !== sequelId) return sequel;
            const nextNum = sequel.acts.length + 1;
            const newAct: Act = { id: uuidv4(), actNumber: nextNum, title, summary, scenes: [], sceneSummariesLocked: false };
            return { ...sequel, acts: [...sequel.acts, newAct] };
        });
        const updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  updateEpisode: (id, updates) => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const seasons = state.project.script.seasons.map(season => ({ ...season, episodes: season.episodes.map(ep => ep.id === id ? { ...ep, ...updates } : ep) }));
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  updateAct: (id, updates) => {
      set(state => {
          if (!state.project || !state.project.script.sequels) return {};
          const sequels = state.project.script.sequels.map(sequel => ({ ...sequel, acts: sequel.acts.map(act => act.id === id ? { ...act, ...updates } : act) }));
          const updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  deleteEpisodeFromSeason: (seasonId, episodeId) => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const seasons = state.project.script.seasons.map(season => {
              if (season.id !== seasonId) return season;
              const filteredEpisodes = season.episodes.filter(ep => ep.id !== episodeId);
              const renumberedEpisodes = filteredEpisodes.map((ep, idx) => ({ ...ep, episodeNumber: idx + 1 }));
              return { ...season, episodes: renumberedEpisodes };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  deleteActFromSequel: (sequelId, actId) => {
      set(state => {
          if (!state.project || !state.project.script.sequels) return {};
          const sequels = state.project.script.sequels.map(sequel => {
              if (sequel.id !== sequelId) return sequel;
              const filteredActs = sequel.acts.filter(act => act.id !== actId);
              const renumberedActs = filteredActs.map((act, idx) => ({ ...act, actNumber: idx + 1 }));
              return { ...sequel, acts: renumberedActs };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  addActToEpisode: (seasonId, episodeId, { title, summary }) => {
      set(state => {
          if (!state.project || !state.project.script.seasons || state.project.format.type === 'EPISODIC') return {};
          const seasons = state.project.script.seasons.map(season => {
              if (season.id !== seasonId) return season;
              const episodes = season.episodes.map(ep => {
                  if (ep.id !== episodeId) return ep;
                  const nextNum = ep.acts.length + 1;
                  const newAct: Act = { id: uuidv4(), actNumber: nextNum, title, summary, scenes: [], sceneSummariesLocked: false };
                  return { ...ep, acts: [...ep.acts, newAct] };
              });
              return { ...season, episodes };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  updateActInEpisode: (seasonId, episodeId, actId, updates) => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const seasons = state.project.script.seasons.map(season => {
              if (season.id !== seasonId) return season;
              const episodes = season.episodes.map(ep => {
                  if (ep.id !== episodeId) return ep;
                  const acts = ep.acts.map(act => act.id === actId ? { ...act, ...updates } : act);
                  return { ...ep, acts };
              });
              return { ...season, episodes };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  deleteActFromEpisode: (seasonId, episodeId, actId) => {
      set(state => {
          if (!state.project || !state.project.script.seasons || state.project.format.type === 'EPISODIC') return {};
          const seasons = state.project.script.seasons.map(season => {
              if (season.id !== seasonId) return season;
              const episodes = season.episodes.map(ep => {
                  if (ep.id !== episodeId) return ep;
                  const filteredActs = ep.acts.filter(act => act.id !== actId);
                  const renumberedActs = filteredActs.map((act, idx) => ({ ...act, actNumber: idx + 1 }));
                  return { ...ep, acts: renumberedActs };
              });
              return { ...season, episodes };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  initializeActsForEpisode: (seasonId, episodeId) => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const seasons = state.project.script.seasons.map(season => {
              if (season.id !== seasonId) return season;
              const episodes = season.episodes.map(ep => {
                  if (ep.id !== episodeId) return ep;
                  const acts: Act[] = [
                      { id: uuidv4(), actNumber: 1, title: '', summary: '', scenes: [], sceneSummariesLocked: false },
                      { id: uuidv4(), actNumber: 2, title: '', summary: '', scenes: [], sceneSummariesLocked: false },
                      { id: uuidv4(), actNumber: 3, title: '', summary: '', scenes: [], sceneSummariesLocked: false },
                  ];
                  return { ...ep, acts };
              });
              return { ...season, episodes };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  setActsForEpisode: (seasonId, episodeId, acts) => {
      set(state => {
          if (!state.project || !state.project.script.seasons) return {};
          const seasons = state.project.script.seasons.map(season => {
              if (season.id !== seasonId) return season;
              const episodes = season.episodes.map(ep => {
                  if (ep.id !== episodeId) return ep;
                  const newActs: Act[] = acts.map((act, index) => ({
                      id: uuidv4(),
                      actNumber: index + 1,
                      title: act.title,
                      summary: act.summary,
                      scenes: [],
                      sceneSummariesLocked: false
                  }));
                  return { ...ep, acts: newActs };
              });
              return { ...season, episodes };
          });
          const updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  setScenesForItem: (itemId, scenes) => {
      set(state => {
          if (!state.project) return {};
          const isEpisodic = state.project.format.type === 'EPISODIC';
          let updatedProject;
          if (isEpisodic) {
              const seasons = state.project.script.seasons!.map(season => ({ ...season, episodes: season.episodes.map(ep => updateItemById(ep, itemId, { scenes }) as Episode) }));
              updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(sequel => ({ ...sequel, acts: sequel.acts.map(act => updateItemById(act, itemId, { scenes }) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  updateSceneSummary: (itemId, sceneId, summary) => {
      set(state => {
          if (!state.project) return {};
          const updateScenes = (scenes: Scene[]) => scenes.map(s => s.id === sceneId ? { ...s, summary } : s);
          let updatedProject;
          if (state.project.format.type === 'EPISODIC') {
              const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Episode) }));
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  lockSceneSummaries: (itemId) => {
    set(state => {
        if (!state.project) return {};
        let updatedProject;
        if (state.project.format.type === 'EPISODIC') {
             const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, { sceneSummariesLocked: true }) as Episode) }));
             updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
        } else {
             const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, { sceneSummariesLocked: true }) as Act) }));
             updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        }
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  toggleSceneContentLock: (itemId, sceneId) => {
      set(state => {
          if (!state.project) return {};
          const updateScenes = (scenes: Scene[]) => scenes.map(s => s.id === sceneId ? { ...s, isContentLocked: !s.isContentLocked } : s);
           let updatedProject;
           if (state.project.format.type === 'EPISODIC') {
              const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Episode) }));
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  setAllScreenplaysForItem: (itemId, result) => {
      set(state => {
          if (!state.project) return {};
          const updateScenes = (scenes: Scene[]) => scenes.map(s => {
              const match = result.scenes.find(r => r.sceneId === s.id);
              if (match) return { ...s, content: match.screenplay };
              return s;
          });
          let updatedProject;
          if (state.project.format.type === 'EPISODIC') {
              const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Episode) }));
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  approveEpisodeActScreenplay: (itemId) => {
      set(state => {
          if (!state.project) return {};
           let updatedProject;
           if (state.project.format.type === 'EPISODIC') {
              const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, { isScreenplayApproved: true }) as Episode) }));
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, { isScreenplayApproved: true }) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  addScreenplayLine: (itemId, sceneId, index, type) => {
      set(state => {
          if (!state.project) return {};
          const updateScenes = (scenes: Scene[]) => scenes.map(s => {
              if (s.id !== sceneId) return s;
              const newContent = [...s.content];
              newContent.splice(index + 1, 0, { type, text: '' });
              return { ...s, content: newContent };
          });
           let updatedProject;
           if (state.project.format.type === 'EPISODIC') {
              const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Episode) }));
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  updateScreenplayLine: (itemId, sceneId, index, text) => {
      set(state => {
           if (!state.project) return {};
           const updateScenes = (scenes: Scene[]) => scenes.map(s => {
              if (s.id !== sceneId) return s;
              const newContent = [...s.content];
              newContent[index] = { ...newContent[index], text };
              return { ...s, content: newContent };
          });
           let updatedProject;
           if (state.project.format.type === 'EPISODIC') {
              const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Episode) }));
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  deleteScreenplayLine: (itemId, sceneId, index) => {
      set(state => {
           if (!state.project) return {};
           const updateScenes = (scenes: Scene[]) => scenes.map(s => {
              if (s.id !== sceneId) return s;
              const newContent = [...s.content];
              newContent.splice(index, 1);
              return { ...s, content: newContent };
          });
          let updatedProject;
          if (state.project.format.type === 'EPISODIC') {
              const seasons = state.project.script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Episode) }));
               updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Act) }));
               updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  setAnalyzedAssets: (itemId, result) => {
      set(state => {
          if (!state.project) return {};
          const bible = { ...state.project.bible };
          
          const normalizeName = (name: string, type: 'character' | 'location' | 'prop') => {
              const lowerName = name.toLowerCase();
              let collection: (Character | Location | Prop)[] = [];
              if (type === 'character') collection = bible.characters;
              if (type === 'location') collection = bible.locations;
              if (type === 'prop') collection = bible.props;

              const existing = collection.find(item => {
                  const itemName = (type === 'character' ? (item as Character).profile.name : (item as Location | Prop).baseProfile.identity.name).toLowerCase();
                  return itemName === lowerName || itemName.includes(lowerName) || lowerName.includes(itemName);
              });

              return existing ? (type === 'character' ? (existing as Character).profile.name : (existing as Location | Prop).baseProfile.identity.name) : name;
          };

          result.identifiedCharacters.forEach(newChar => {
              const normalized = normalizeName(newChar.profile.name, 'character');
              const exists = bible.characters.find(c => c.profile.name === normalized);
              if (!exists) {
                   const defaultProfile = createDefaultCharacterProfile(newChar.profile.name);
                   const char: Character = { id: uuidv4(), profile: { ...defaultProfile, ...newChar.profile }, timeline: [], consistencyMode: 'STRICT', analysis: newChar.analysis, appearances: 0 };
                   bible.characters.push(char);
              }
          });

          result.identifiedLocations.forEach(newLoc => {
               const normalized = normalizeName(newLoc.baseProfile.identity.name, 'location');
               const exists = bible.locations.find(l => l.baseProfile.identity.name === normalized);
               if (!exists) {
                   const defaultProfile = createDefaultLocationBaseProfile(newLoc.baseProfile.identity.name);
                   const loc: Location = { id: uuidv4(), baseProfile: { ...defaultProfile, ...newLoc.baseProfile }, timeline: [], consistencyMode: 'STRICT', analysis: newLoc.analysis, appearances: 0 };
                   bible.locations.push(loc);
               }
          });

           result.identifiedProps.forEach(newProp => {
               const normalized = normalizeName(newProp.baseProfile.identity.name, 'prop');
               const exists = bible.props.find(p => p.baseProfile.identity.name === normalized);
               if (!exists) {
                   const defaultProfile = createDefaultPropBaseProfile(newProp.baseProfile.identity.name);
                   const prop: Prop = { id: uuidv4(), baseProfile: { ...defaultProfile, ...newProp.baseProfile }, timeline: [], consistencyMode: 'STRICT', analysis: newProp.analysis, appearances: 0 };
                   bible.props.push(prop);
               }
          });

          result.assetStateChanges.forEach(change => {
               const snapshot: StateSnapshot = { ...change.snapshot, id: uuidv4() };
               const normalizedName = normalizeName(change.assetName, change.assetType as 'character' | 'location' | 'prop');
               if (change.assetType === 'character') {
                   const asset = bible.characters.find(c => c.profile.name === normalizedName);
                   if (asset) asset.timeline.push(snapshot);
               } else if (change.assetType === 'location') {
                   const asset = bible.locations.find(l => l.baseProfile.identity.name === normalizedName);
                   if (asset) asset.timeline.push(snapshot);
               } else {
                   const asset = bible.props.find(p => p.baseProfile.identity.name === normalizedName);
                   if (asset) asset.timeline.push(snapshot);
               }
          });

          const updateScenes = (scenes: Scene[]) => scenes.map(s => {
              const map = result.sceneAssetMapping.find(m => m.sceneId === s.id);
              if (map) {
                  return { 
                      ...s, 
                      assets: {
                          characters: map.assets.characters.map(c => normalizeName(c, 'character')),
                          locations: map.assets.locations.map(l => normalizeName(l, 'location')),
                          props: map.assets.props.map(p => normalizeName(p, 'prop'))
                      } 
                  };
              }
              return s;
          });

          let script = state.project.script;
          if (state.project.format.type === 'EPISODIC') {
              const seasons = script.seasons!.map(s => ({ ...s, episodes: s.episodes.map(e => updateItemById(e, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Episode) }));
              script = { ...script, seasons };
          } else {
              const sequels = script.sequels!.map(s => ({ ...s, acts: s.acts.map(a => updateItemById(a, itemId, (item) => ({ ...item, scenes: updateScenes(item.scenes) })) as Act) }));
              script = { ...script, sequels };
          }

          const updatedProject = { ...state.project, bible, script };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  addShot: (sceneId) => {
    set(state => {
        if (!state.project) return {};
        const currentShots = state.project.studio.shotsByScene[sceneId] || [];
        const nextNum = currentShots.length + 1;
        // Default locked upon creation, AND now origin: 'user'
        const newShot: Shot = { 
            id: uuidv4(), 
            shotNumber: nextNum, 
            description: "New shot", 
            isLocked: true,
            origin: 'user' // Added
        };
        const updatedShotsByScene = { ...state.project.studio.shotsByScene, [sceneId]: [...currentShots, newShot] };
        const updatedProject = { ...state.project, studio: { ...state.project.studio, shotsByScene: updatedShotsByScene } };
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  updateShot: (sceneId, shotId, updates) => {
      set(state => {
          if (!state.project) return {};
          const sceneShots = state.project.studio.shotsByScene[sceneId] || [];
          const updatedShots = sceneShots.map(shot => {
              if (shot.id === shotId) return { ...shot, ...updates };
              return shot;
          });
          const updatedProject = {
              ...state.project,
              studio: { ...state.project.studio, shotsByScene: { ...state.project.studio.shotsByScene, [sceneId]: updatedShots } },
              metadata: { ...state.project.metadata, updatedAt: Date.now() }
          };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  deleteShot: (sceneId, shotId) => {
      set(state => {
          if (!state.project) return {};
          const currentShots = state.project.studio.shotsByScene[sceneId] || [];
          const updatedShots = currentShots.filter(s => s.id !== shotId);
          // Renumber shots
          const renumberedShots = updatedShots.map((s, idx) => ({ ...s, shotNumber: idx + 1 }));
          
          const updatedShotsByScene = { ...state.project.studio.shotsByScene, [sceneId]: renumberedShots };
          const updatedProject = { ...state.project, studio: { ...state.project.studio, shotsByScene: updatedShotsByScene } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  addScene: (itemId) => {
    set(state => {
        if (!state.project) return {};
        
        const createScene = (currentScenes: Scene[]): Scene => ({
            id: uuidv4(),
            sceneNumber: currentScenes.length + 1,
            setting: 'INT. UNKNOWN - DAY',
            summary: '',
            content: [],
            assets: { characters: [], locations: [], props: [] },
            isContentLocked: false
        });

        const updateScenesInItem = (item: Episode | Act): Episode | Act => {
            if (item.id === itemId) {
                const newHistory = addHistoryEntry(item, 'add', `Added Scene ${item.scenes.length + 1}`, item.scenes);
                return { 
                    ...item, 
                    scenes: [...item.scenes, createScene(item.scenes)],
                    sceneHistory: newHistory,
                    sceneRedoStack: undefined
                };
            }
            if ('acts' in item && item.acts) {
                return { ...item, acts: item.acts.map(a => updateScenesInItem(a) as Act) };
            }
            return item;
        };

        let updatedProject;
        if (state.project.format.type === 'EPISODIC') {
            const seasons = state.project.script.seasons!.map(s => ({
                ...s,
                episodes: s.episodes.map(updateScenesInItem as (e: Episode) => Episode)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
        } else {
            const sequels = state.project.script.sequels!.map(s => ({
                ...s,
                acts: s.acts.map(updateScenesInItem as (a: Act) => Act)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        }
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  deleteScene: (itemId, sceneId) => {
    set(state => {
        if (!state.project) return {};

        const updateScenesInItem = (item: Episode | Act): Episode | Act => {
            if (item.id === itemId) {
                const sceneToDelete = item.scenes.find(s => s.id === sceneId);
                const newHistory = addHistoryEntry(item, 'delete', `Deleted Scene ${sceneToDelete?.sceneNumber || 'Unknown'}`, item.scenes);

                const filtered = item.scenes.filter(s => s.id !== sceneId);
                const renumbered = filtered.map((s, i) => ({ ...s, sceneNumber: i + 1 }));
                
                return { ...item, scenes: renumbered, sceneHistory: newHistory, sceneRedoStack: undefined };
            }
            if ('acts' in item && item.acts) {
                return { ...item, acts: item.acts.map(a => updateScenesInItem(a) as Act) };
            }
            return item;
        };

        let updatedProject;
        if (state.project.format.type === 'EPISODIC') {
            const seasons = state.project.script.seasons!.map(s => ({
                ...s,
                episodes: s.episodes.map(updateScenesInItem as (e: Episode) => Episode)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
        } else {
            const sequels = state.project.script.sequels!.map(s => ({
                ...s,
                acts: s.acts.map(updateScenesInItem as (a: Act) => Act)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        }
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  reorderScenes: (itemId, newScenes) => {
      set(state => {
          if (!state.project) return {};
          
          const updateScenesInItem = (item: Episode | Act): Episode | Act => {
                if (item.id === itemId) {
                    let description = 'Reordered Scenes';
                    
                    // Detailed move description
                    // Find first scene where the ID at the new index is different from the old ID
                    let movedScene: Scene | undefined;
                    let oldIndex = -1;
                    let newIndex = -1;

                    // Simple heuristic: find the scene in newScenes that has a different index in item.scenes
                    for (let i = 0; i < newScenes.length; i++) {
                        const scene = newScenes[i];
                        const originalIndex = item.scenes.findIndex(s => s.id === scene.id);
                        if (originalIndex !== i) {
                            movedScene = scene;
                            newIndex = i;
                            oldIndex = originalIndex;
                            break;
                        }
                    }

                    if (movedScene && oldIndex !== -1) {
                        description = `Reordered: Scene ${oldIndex + 1} -> Position ${newIndex + 1}`;
                    }

                    const newHistory = addHistoryEntry(item, 'reorder', description, item.scenes);

                    // Renumber scenes based on new order
                    const renumbered = newScenes.map((s, i) => {
                        return { ...s, sceneNumber: i + 1 };
                    });
                    
                    return { ...item, scenes: renumbered, sceneHistory: newHistory, sceneRedoStack: undefined };
                }
                if ('acts' in item && item.acts) {
                    return { ...item, acts: item.acts.map(a => updateScenesInItem(a) as Act) };
                }
                return item;
          };

          const isEpisodic = state.project.format.type === 'EPISODIC';
          let updatedProject;
          
          if (isEpisodic) {
              const seasons = state.project.script.seasons!.map(s => ({
                  ...s,
                  episodes: s.episodes.map(updateScenesInItem as (e: Episode) => Episode)
              }));
              updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({
                  ...s,
                  acts: s.acts.map(updateScenesInItem as (a: Act) => Act)
              }));
              updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }

          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  revertSceneHistory: (itemId, historyId) => {
      set(state => {
          if (!state.project) return {};
          
          const updateScenesInItem = (item: Episode | Act): Episode | Act => {
                if (item.id === itemId) {
                    const historyEntry = item.sceneHistory?.find(h => h.id === historyId);
                    if (!historyEntry) return item;

                    // When reverting, we create a new entry on top, clearing future redos
                    // This is the "Manual Revert" behavior requested
                    const newHistory = addHistoryEntry(item, 'reorder', `Reverted to: ${historyEntry.description}`, item.scenes);
                    
                    return { ...item, scenes: historyEntry.snapshot, sceneHistory: newHistory, sceneRedoStack: undefined };
                }
                if ('acts' in item && item.acts) {
                    return { ...item, acts: item.acts.map(a => updateScenesInItem(a) as Act) };
                }
                return item;
          };

          const isEpisodic = state.project.format.type === 'EPISODIC';
          let updatedProject;
          if (isEpisodic) {
              const seasons = state.project.script.seasons!.map(s => ({
                  ...s,
                  episodes: s.episodes.map(updateScenesInItem as (e: Episode) => Episode)
              }));
              updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
          } else {
              const sequels = state.project.script.sequels!.map(s => ({
                  ...s,
                  acts: s.acts.map(updateScenesInItem as (a: Act) => Act)
              }));
              updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
          }
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
  },

  revertToInitial: (itemId) => {
    set(state => {
        if (!state.project) return {};
        
        const updateScenesInItem = (item: Episode | Act): Episode | Act => {
              if (item.id === itemId) {
                  if (!item.sceneHistory || item.sceneHistory.length === 0) return item;

                  const oldestEntry = item.sceneHistory[item.sceneHistory.length - 1];
                  
                  const newHistory = addHistoryEntry(item, 'reorder', `Reverted All Changes`, item.scenes);
                  
                  return { ...item, scenes: oldestEntry.snapshot, sceneHistory: newHistory, sceneRedoStack: undefined };
              }
              if ('acts' in item && item.acts) {
                  return { ...item, acts: item.acts.map(a => updateScenesInItem(a) as Act) };
              }
              return item;
        };

        const isEpisodic = state.project.format.type === 'EPISODIC';
        let updatedProject;
        if (isEpisodic) {
            const seasons = state.project.script.seasons!.map(s => ({
                ...s,
                episodes: s.episodes.map(updateScenesInItem as (e: Episode) => Episode)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
        } else {
            const sequels = state.project.script.sequels!.map(s => ({
                ...s,
                acts: s.acts.map(updateScenesInItem as (a: Act) => Act)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        }
        debouncedSave(updatedProject);
        return { project: updatedProject };
    });
  },

  undoSceneAction: (itemId) => {
      set(state => {
        if (!state.project) return {};

        const updateScenesInItem = (item: Episode | Act): Episode | Act => {
            if (item.id === itemId) {
                if (!item.sceneHistory || item.sceneHistory.length === 0) return item;

                // Get most recent history
                const [lastEntry, ...remainingHistory] = item.sceneHistory;
                
                // Create a Redo Entry for the CURRENT state before overwriting it
                const redoEntry: SceneHistoryEntry = {
                    id: uuidv4(),
                    timestamp: Date.now(),
                    actionType: lastEntry.actionType, // Inherit type for context
                    description: `Redo: Revert of ${lastEntry.description}`, 
                    snapshot: item.scenes // Snapshot of CURRENT state (the future state)
                };

                const newRedoStack = [redoEntry, ...(item.sceneRedoStack || [])];

                return {
                    ...item,
                    scenes: lastEntry.snapshot,
                    sceneHistory: remainingHistory, // Pop from history
                    sceneRedoStack: newRedoStack // Push to redo
                };
            }
            if ('acts' in item && item.acts) {
                return { ...item, acts: item.acts.map(a => updateScenesInItem(a) as Act) };
            }
            return item;
        };

        const isEpisodic = state.project.format.type === 'EPISODIC';
        let updatedProject;
        if (isEpisodic) {
            const seasons = state.project.script.seasons!.map(s => ({
                ...s,
                episodes: s.episodes.map(updateScenesInItem as (e: Episode) => Episode)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
        } else {
            const sequels = state.project.script.sequels!.map(s => ({
                ...s,
                acts: s.acts.map(updateScenesInItem as (a: Act) => Act)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        }
        debouncedSave(updatedProject);
        return { project: updatedProject };
      });
  },

  redoSceneAction: (itemId) => {
      set(state => {
        if (!state.project) return {};

        const updateScenesInItem = (item: Episode | Act): Episode | Act => {
            if (item.id === itemId) {
                if (!item.sceneRedoStack || item.sceneRedoStack.length === 0) return item;

                // Get most recent redo
                const [nextEntry, ...remainingRedo] = item.sceneRedoStack;

                // Add the CURRENT state back to history (Undoable again)
                // We construct a history entry representing the state we are leaving
                // Note: Simplification - we just push current state as a 'undo' snapshot
                const undoEntry: SceneHistoryEntry = {
                    id: uuidv4(),
                    timestamp: Date.now(),
                    actionType: 'reorder',
                    description: "Undo of Redo",
                    snapshot: item.scenes
                };

                const newHistory = [undoEntry, ...(item.sceneHistory || [])];

                return {
                    ...item,
                    scenes: nextEntry.snapshot,
                    sceneHistory: newHistory,
                    sceneRedoStack: remainingRedo
                };
            }
            if ('acts' in item && item.acts) {
                return { ...item, acts: item.acts.map(a => updateScenesInItem(a) as Act) };
            }
            return item;
        };

        const isEpisodic = state.project.format.type === 'EPISODIC';
        let updatedProject;
        if (isEpisodic) {
            const seasons = state.project.script.seasons!.map(s => ({
                ...s,
                episodes: s.episodes.map(updateScenesInItem as (e: Episode) => Episode)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, seasons } };
        } else {
            const sequels = state.project.script.sequels!.map(s => ({
                ...s,
                acts: s.acts.map(updateScenesInItem as (a: Act) => Act)
            }));
            updatedProject = { ...state.project, script: { ...state.project.script, sequels } };
        }
        debouncedSave(updatedProject);
        return { project: updatedProject };
      });
  },
  
  clearLastMovedSceneId: () => set({ lastMovedSceneId: null }),

  generateShotsForScene: async (sceneId) => {
      const { project, isGeneratingGlobal, setGenerating, generationModel } = get();
      if (!project || isGeneratingGlobal) return;
      
      setGenerating(true, "Architecting cinematic shots...");
      try {
          let targetScene: Scene | undefined;
      const isEpisodic = project.format.type === 'EPISODIC';
      if (isEpisodic) {
           for(const season of project.script.seasons || []) {
               for(const ep of season.episodes) {
                   const found = ep.scenes.find(s => s.id === sceneId);
                   if (found) { targetScene = found; break; }
               }
               if(targetScene) break;
           }
      } else {
          for(const sequel of project.script.sequels || []) {
               for(const act of sequel.acts) {
                   const found = act.scenes.find(s => s.id === sceneId);
                   if (found) { targetScene = found; break; }
               }
               if(targetScene) break;
           }
      }

      if (!targetScene) throw new Error("Scene not found.");

      const shotList = await geminiService.generateShotListForScene(targetScene, project, generationModel);
      
      const newShots: Shot[] = shotList.map((s, index) => {
          const refs: ShotReferenceImage[] = [];
          
          s.keyAssets.forEach(assetName => {
              const char = project.bible.characters.find(c => c.profile.name.toLowerCase() === assetName.toLowerCase());
              if (char && char.profile.generatedImageUrl) {
                  refs.push({ id: uuidv4(), sourceType: 'character', url: char.profile.generatedImageUrl, isActive: true, name: char.profile.name });
                  return;
              }
              const loc = project.bible.locations.find(l => l.baseProfile.identity.name.toLowerCase() === assetName.toLowerCase());
              if (loc && loc.baseProfile.visuals.generatedImageUrl) {
                   refs.push({ id: uuidv4(), sourceType: 'location', url: loc.baseProfile.visuals.generatedImageUrl, isActive: true, name: loc.baseProfile.identity.name });
                   return;
              }
              const prop = project.bible.props.find(p => p.baseProfile.identity.name.toLowerCase() === assetName.toLowerCase());
              if (prop && prop.baseProfile.visuals.generatedImageUrl) {
                   refs.push({ id: uuidv4(), sourceType: 'prop', url: prop.baseProfile.visuals.generatedImageUrl, isActive: true, name: prop.baseProfile.identity.name });
                   return;
              }
          });

          return {
              id: uuidv4(),
              shotNumber: index + 1,
              description: s.description,
              visualPromptText: s.description,
              referenceImages: refs,
              isLocked: true, 
              origin: 'ai' // Added
          };
      });

      set(state => {
          if (!state.project) return {};
          const updatedShotsByScene = { ...state.project.studio.shotsByScene, [sceneId]: newShots };
           const updatedProject = { ...state.project, studio: { ...state.project.studio, shotsByScene: updatedShotsByScene } };
          debouncedSave(updatedProject);
          return { project: updatedProject };
      });
      } finally {
        setGenerating(false);
      }
  },

  fetchModels: async () => {
      // 1. Fetch Remote
      const remoteModels = await modelGateway.fetchRemoteDefinitions();
      
      // 2. Get Local Custom Models
      const { customModels } = get();

      // 3. Merge: Custom overrides Remote if ID matches
      const mergedModels = [...remoteModels];
      
      for (const custom of customModels) {
          const index = mergedModels.findIndex(m => m.id === custom.id);
          if (index !== -1) {
              mergedModels[index] = custom;
          } else {
              mergedModels.push(custom);
          }
      }

      set({ availableModels: mergedModels });
  },

  updateApiKey: (provider, key) => {
      // 1. Update Local Storage
      if (provider === 'google_native') {
          localStorage.setItem('gemini_api_key', key);
      } else {
          localStorage.setItem(`apikey_${provider}`, key);
      }

      // 2. Update Store
      set(state => ({
          apiKeys: {
              ...state.apiKeys,
              [provider]: key
          }
      }));
  },

  addCustomModel: (model) => {
      set(state => {
          const newCustomModels = [...state.customModels.filter(m => m.id !== model.id), model];
          localStorage.setItem('custom_models', JSON.stringify(newCustomModels));
          
          // Re-merge with available
          const mergedModels = [...state.availableModels.filter(m => m.id !== model.id), model];
          
          return {
              customModels: newCustomModels,
              availableModels: mergedModels
          };
      });
  },

  removeCustomModel: (id) => {
      set(state => {
          const newCustomModels = state.customModels.filter(m => m.id !== id);
          localStorage.setItem('custom_models', JSON.stringify(newCustomModels));
          
          // Re-fetch to restore remote defaults if they were overridden
          // We can just trigger fetchModels, but calling it async here is tricky in reducer.
          // Simplest is to remove from availableModels IF it was a custom one.
          // Ideally, we should re-run the merge logic.
          
          // Trigger a re-fetch logic manually:
          // We can't easily access remoteModels here without fetching again. 
          // For now, remove it from availableModels, and rely on the next load/refresh to bring back remote defaults if needed.
          const newAvailable = state.availableModels.filter(m => m.id !== id);
          
          return {
              customModels: newCustomModels,
              availableModels: newAvailable
          };
      });
      // Trigger full fetch to be safe and restore overridden defaults
      get().fetchModels();
  },

  autoPopulateStoryBible: async (model: GeminiModel = 'gemini-3.1-flash-preview') => {
      const { project, populateCharacterProfile, populateLocationProfile, populatePropProfile, updateCharacter, updateLocation, updateProp, setGenerating, isGeneratingGlobal } = get();
      if (!project || isGeneratingGlobal) return { success: false, failedAssets: [] };

      setGenerating(true, "Populating story bible assets...");
      const failedAssets: { id: string; name: string; type: AssetType }[] = [];
      
      try {
          const characters = project.bible.characters || [];
          const locations = project.bible.locations || [];
          const props = project.bible.props || [];

          // Helper to check if asset needs population
          const needsPopulation = (asset: Asset) => {
              if ('profile' in asset) {
                  const p = asset.profile;
                  return !p.coreIdentity?.primaryNarrativeRole || p.coreIdentity.primaryNarrativeRole === 'Unknown' ||
                        !p.visualDna?.gender ||
                        !p.vocalProfile?.pacing;
              } else {
                  const b = asset.baseProfile;
                  return !b.narrative?.description ||
                        !b.visuals?.visualPrompt;
              }
          };

          // Process Characters
          for (const char of characters) {
              if (needsPopulation(char)) {
                  try {
                      const fullProfile = await geminiService.generateCharacterProfile(char, project, model, char.analysis);
                      populateCharacterProfile(char.id, fullProfile);
                  } catch (e) {
                      console.error(`Failed to populate character ${char.profile.name}:`, e);
                      failedAssets.push({ id: char.id, name: char.profile.name, type: 'character' });
                      updateCharacter({ id: char.id, consistencyMode: 'FLEXIBLE' });
                  }
              }
          }

          // Process Locations
          for (const loc of locations) {
              if (needsPopulation(loc)) {
                  try {
                      const fullProfile = await geminiService.generateLocationProfile(loc, project, model, loc.analysis);
                      populateLocationProfile(loc.id, fullProfile);
                  } catch (e) {
                      console.error(`Failed to populate location ${loc.baseProfile.identity.name}:`, e);
                      failedAssets.push({ id: loc.id, name: loc.baseProfile.identity.name, type: 'location' });
                      updateLocation({ id: loc.id, consistencyMode: 'FLEXIBLE' });
                  }
              }
          }

          // Process Props
          for (const prop of props) {
              if (needsPopulation(prop)) {
                  try {
                      const fullProfile = await geminiService.generatePropProfile(prop, project, model, prop.analysis);
                      populatePropProfile(prop.id, fullProfile);
                  } catch (e) {
                      console.error(`Failed to populate prop ${prop.baseProfile.identity.name}:`, e);
                      failedAssets.push({ id: prop.id, name: prop.baseProfile.identity.name, type: 'prop' });
                      updateProp({ id: prop.id, consistencyMode: 'FLEXIBLE' });
                  }
              }
          }

          return { 
              success: failedAssets.length === 0, 
              failedAssets 
          };
      } finally {
          setGenerating(false);
      }
  },

  setUser: (user) => {
      set({ user });
      if (user) {
          localStorage.setItem('user_profile', JSON.stringify(user));
      } else {
          localStorage.removeItem('user_profile');
      }
  },

  recordUsage: (modelId, resolution) => {
    const { usageStats } = get();
    const today = new Date().toISOString().split('T')[0];
    let currentStats = { ...usageStats };

    if (currentStats.lastResetDate !== today) {
       currentStats = {
          modelCounts: {},
          lastResetDate: today
       };
    }

    const key = resolution ? `${modelId}:${resolution}` : modelId;
    currentStats.modelCounts = {
        ...currentStats.modelCounts,
        [key]: (currentStats.modelCounts[key] || 0) + 1
    };

    localStorage.setItem('usage_stats', JSON.stringify(currentStats));
    set({ usageStats: currentStats });
  },

  resetUsage: () => {
    const today = new Date().toISOString().split('T')[0];
    const newStats = {
      modelCounts: {},
      lastResetDate: today
    };
    localStorage.setItem('usage_stats', JSON.stringify(newStats));
    set({ usageStats: newStats });
  },

  setGenerating: (isGenerating, taskName) => {
    set({ isGeneratingGlobal: isGenerating, globalGenerationTask: taskName || null });
  },

  generateSynopsisGlobal: async (model) => {
    const { project, setGenerating, updateProject } = get();
    if (!project || get().isGeneratingGlobal) return;

    setGenerating(true, "Crafting story synopsis...");
    try {
      const synopsis = await geminiService.generateSynopsis(project, model);
      if (synopsis) {
        updateProject({ 
            bible: { ...project.bible, synopsis } 
        });
      }
    } catch (e) {
      console.error("Global synopsis generation failed", e);
      throw e;
    } finally {
      setGenerating(false);
    }
  },

  generateInitialStructureGlobal: async (model) => {
    const { project, setGenerating, updateProject } = get();
    if (!project || get().isGeneratingGlobal) return;

    setGenerating(true, "Architecting story structure...");
    try {
      const result = await geminiService.generateInitialStructure(project, model);
      if (result && result.length > 0) {
        const isEpisodic = project.format.type === 'EPISODIC';
        
        if (isEpisodic) {
            const newSeason: Season = {
                id: uuidv4(),
                seasonNumber: (project.script.seasons?.length || 0) + 1,
                title: `Season ${(project.script.seasons?.length || 0) + 1}`,
                logline: '',
                episodes: result as Episode[],
                isLocked: false
            };
            updateProject({ 
                script: { ...project.script, seasons: [...(project.script.seasons || []), newSeason] } 
            });
        } else {
            const newSequel: Sequel = {
                id: uuidv4(),
                partNumber: (project.script.sequels?.length || 0) + 1,
                title: `Part ${(project.script.sequels?.length || 0) + 1}`,
                summary: '',
                acts: result as Act[],
                isLocked: false
            };
            updateProject({ 
                script: { ...project.script, sequels: [...(project.script.sequels || []), newSequel] } 
            });
        }
      }
    } catch (e) {
      console.error("Global structure generation failed", e);
      throw e;
    } finally {
      setGenerating(false);
    }
  },

  logout: () => {
      set({ user: null });
      localStorage.removeItem('user_profile');
  }
}));
