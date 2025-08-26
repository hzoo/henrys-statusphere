import { 
  initializeOAuth, 
  checkExistingSession, 
  handleOAuthCallback, 
  startLoginProcess, 
  logout, 
  getCurrentSession,
} from "./oauth.ts";

const loggedOutView = document.getElementById('logged-out-view') as HTMLElement;
const loggedInView = document.getElementById('logged-in-view') as HTMLElement;
const userInfo = document.getElementById('user-info') as HTMLElement;
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
const statusForm = document.getElementById('status-form') as HTMLFormElement;
const statusInput = document.getElementById('status-input') as HTMLInputElement;
const statusBtns = document.querySelectorAll('.status-btn') as NodeListOf<HTMLButtonElement>;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const timeline = document.getElementById('status-timeline') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;
const noStatuses = document.getElementById('no-statuses') as HTMLElement;
const emojiTip = document.getElementById('emoji-tip') as HTMLElement;

interface Status {
  uri: string;
  did: string;
  status: string;
  created_at: string;
  indexed_at: string;
}

interface Profile {
  handle: string;
  displayName?: string;
  avatar?: string;
}

document.addEventListener('DOMContentLoaded', async () => {
  initializeOAuth();
  await loadTimeline();
  
  try {
    const callbackSession = await handleOAuthCallback();
    if (callbackSession) {
      showLoggedInView();
      return;
    }
  } catch (error) {
    alert('Login failed. Please try again.');
  }
  
  const existingSession = await checkExistingSession();
  if (existingSession) {
    showLoggedInView();
  }
});

loginBtn.addEventListener('click', async () => {
  try {
    await startLoginProcess('bsky.social');
  } catch (error) {
    alert('Failed to start login. Please try again.');
  }
});

statusBtns.forEach((btn: HTMLButtonElement) => {
  btn.addEventListener('click', () => {
    statusInput.value = btn.dataset.status || '';
  });
});

statusForm.addEventListener('submit', async (e: Event) => {
  e.preventDefault();
  const status = statusInput.value.trim();
  const currentSession = getCurrentSession();
  
  if (!status || !currentSession) return;
  
  try {
    const statusRecord = {
      $type: "xyz.statusphere.status",
      status,
      createdAt: new Date().toISOString(),
    };
    
    const { ok, data } = await (currentSession.rpc as any).post("com.atproto.repo.createRecord", {
      input: {
        repo: currentSession.did,
        collection: "xyz.statusphere.status",
        record: statusRecord,
      },
    });
    
    if (!ok) {
      throw new Error(`Error posting status: ${data.error}`);
    }
    
    statusInput.value = '';
    setTimeout(() => loadTimeline(), 1000);
    
  } catch (error) {
    console.error('Failed to post status:', error);
    alert('Failed to post status. Please try again.');
  }
});

logoutBtn.addEventListener('click', async () => {
  await logout();
  showLoggedOutView();
});

function showLoggedInView(): void {
  const currentSession = getCurrentSession();
  if (!currentSession) return;
  
  loggedOutView.classList.add('hidden');
  loggedInView.classList.remove('hidden');
  
  const displayName = currentSession.displayName || currentSession.handle.split('.')[0];
  userInfo.innerHTML = `Hi, <strong>${displayName}</strong>. What's your status today?`;
  
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
  
  if (isMac && emojiTip) {
    emojiTip.innerHTML = 'tip: <kbd class="bg-gray-100 px-1 rounded text-xs">⌃ + ⌘ + Space</kbd> opens emoji picker';
  } else if (isWindows && emojiTip) {
    emojiTip.innerHTML = 'tip: <kbd class="bg-gray-100 px-1 rounded text-xs">Win + .</kbd> opens emoji picker';
  } else if (emojiTip) {
    emojiTip.innerHTML = 'tip: Most systems have an emoji picker shortcut';
  }
}

function showLoggedOutView(): void {
  loggedInView.classList.add('hidden');
  loggedOutView.classList.remove('hidden');
}

async function loadTimeline(): Promise<void> {
  try {
    const response = await fetch('/api/statuses');
    const statuses = await response.json() as Status[];
    
    loading.classList.add('hidden');
    
    if (statuses.length === 0) {
      noStatuses.classList.remove('hidden');
      timeline.classList.add('hidden');
    } else {
      noStatuses.classList.add('hidden');
      timeline.classList.remove('hidden');
      
      const uniqueDids = [...new Set(statuses.map(s => s.did))];
      const profiles = new Map<string, Profile>();
      
      for (const did of uniqueDids) {
        try {
          const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`);
          if (response.ok) {
            const profile = await response.json() as any;
            profiles.set(did, {
              handle: profile.handle,
              displayName: profile.displayName,
              avatar: profile.avatar,
            });
          }
        } catch (error) {
          console.log(`Could not fetch profile for ${did}`);
        }
      }
      
      timeline.innerHTML = statuses.map(status => {
        const profile = profiles.get(status.did);
        const handle = profile?.handle || status.did.replace("did:plc:", "").substring(0, 8) + "...";
        const avatar = profile?.avatar;
        
        return `
          <div class="flex items-start justify-between text-sm">
            <div class="flex items-center space-x-2">
              ${avatar ? `<img src="${avatar}" alt="" class="w-4 h-4 rounded-full flex-shrink-0" />` : ''}
              <span>
                <a href="https://bsky.app/profile/${status.did}" target="_blank" class="underline">${handle}</a> is feeling ${status.status} today
              </span>
            </div>
            <span class="text-xs text-gray-500 ml-2 flex-shrink-0">
              ${new Date(status.indexed_at).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
              })}
            </span>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Failed to load timeline:', error);
    loading.innerHTML = '<span class="text-red-500">Failed to load timeline</span>';
  }
}
