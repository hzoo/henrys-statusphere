import { 
  initializeOAuth, 
  checkExistingSession, 
  handleOAuthCallback, 
  startLoginProcess, 
  logout, 
  getCurrentSession,
} from "./oauth.ts";
import type { StatusRecord, Profile } from "../types";

const loggedOutView = document.getElementById('logged-out-view') as HTMLElement;
const loggedInView = document.getElementById('logged-in-view') as HTMLElement;
const userInfo = document.getElementById('user-info') as HTMLElement;
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
const statusForm = document.getElementById('status-form') as HTMLFormElement;
const statusInput = document.getElementById('status-input') as HTMLInputElement;
const popularEmojisContainer = document.getElementById('popular-emojis') as HTMLElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const profileLink = document.getElementById('profile-link') as HTMLAnchorElement;
const timeline = document.getElementById('status-timeline') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;
const noStatuses = document.getElementById('no-statuses') as HTMLElement;
const emojiTip = document.getElementById('emoji-tip') as HTMLElement;

document.addEventListener('DOMContentLoaded', async () => {
  initializeOAuth();
  await loadTimeline();
  await loadPopularEmojis();
  
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
  } else {
    showLoggedOutView();
  }
});

loginBtn.addEventListener('click', async () => {
  try {
    await startLoginProcess('bsky.social');
  } catch (error) {
    alert('Failed to start login. Please try again.');
  }
});

// Status button event listeners are now handled dynamically in loadPopularEmojis()

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
    setTimeout(() => {
      loadTimeline();
      loadPopularEmojis();
    }, 1000);
    
  } catch (error) {
    console.error('Failed to post status:', error);
    alert('Failed to post status. Please try again.');
  }
});

logoutBtn.addEventListener('click', async () => {
  await logout();
  showLoggedOutView();
});

function formatCount(count: number): string {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
  return count.toString();
}

async function loadPopularEmojis(): Promise<void> {
  try {
    const response = await fetch('/api/popular');
    const popularStatuses = await response.json();
    
    // Fallback emojis if no popular ones exist yet
    const fallbackEmojis = ['😊', '🔥', '💯', '👍', '😍', '🤔', '😎', '🙃', '😂', '💙', '🚀', '✨'];
    
    // Clear existing buttons
    popularEmojisContainer.innerHTML = '';
    
    if (popularStatuses.length > 0) {
      // Show popular emojis with counts - limit to top 12 to avoid clutter
      const topEmojis = popularStatuses.slice(0, 12);
      
      topEmojis.forEach((item: {status: string, count: number}, index: number) => {
        const button = document.createElement('button');
        button.type = 'button';
        
        // Add medal colors for top 3
        let medalClass = '';
        if (index === 0) medalClass = 'bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-300 hover:border-yellow-400'; // Gold
        else if (index === 1) medalClass = 'bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-400 hover:border-gray-500'; // Silver  
        else if (index === 2) medalClass = 'bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-300 hover:border-orange-400'; // Bronze
        else medalClass = 'border border-gray-300 hover:border-black hover:bg-gray-50';
        
        button.className = `status-btn flex flex-col items-center justify-center text-lg p-2 ${medalClass}`;
        button.dataset.status = item.status;
        
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = item.status;
        emojiSpan.className = 'text-xl leading-none';
        
        const countSpan = document.createElement('span');
        countSpan.textContent = formatCount(item.count);
        countSpan.className = 'text-xs text-gray-500 leading-none mt-1';
        
        button.appendChild(emojiSpan);
        button.appendChild(countSpan);
        
        button.addEventListener('click', () => {
          statusInput.value = item.status;
        });
        
        popularEmojisContainer.appendChild(button);
      });
    } else {
      // Use fallback emojis without counts
      fallbackEmojis.forEach((emoji: string) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'status-btn text-xl p-2 border border-gray-300 hover:border-black';
        button.dataset.status = emoji;
        button.textContent = emoji;
        button.addEventListener('click', () => {
          statusInput.value = emoji;
        });
        popularEmojisContainer.appendChild(button);
      });
    }
    
  } catch (error) {
    console.error('Failed to load popular emojis:', error);
    // Use fallback emojis on error
    const fallbackEmojis = ['😊', '🔥', '💯', '👍', '😍', '🤔', '😎', '🙃', '😂', '💙', '🚀', '✨'];
    popularEmojisContainer.innerHTML = '';
    fallbackEmojis.forEach((emoji: string) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'status-btn text-xl p-2 border border-gray-300 hover:border-black';
      button.dataset.status = emoji;
      button.textContent = emoji;
      button.addEventListener('click', () => {
        statusInput.value = emoji;
      });
      popularEmojisContainer.appendChild(button);
    });
  }
}

function showLoggedInView(): void {
  const currentSession = getCurrentSession();
  if (!currentSession) return;
  
  document.getElementById('auth-section')!.classList.remove('hidden');
  loggedOutView.classList.add('hidden');
  loggedInView.classList.remove('hidden');
  
  const displayName = currentSession.displayName || currentSession.handle.split('.')[0];
  userInfo.innerHTML = `Hi, <strong>${displayName}</strong>. What's your status today?`;
  
  profileLink.href = `/profile/${currentSession.handle}`;
  
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
  document.getElementById('auth-section')!.classList.remove('hidden');
  loggedInView.classList.add('hidden');
  loggedOutView.classList.remove('hidden');
}

async function loadTimeline(): Promise<void> {
  try {
    const response = await fetch('/api/statuses');
    const statuses = await response.json() as StatusRecord[];
    
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
              did: profile.did,
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
              ${new Date(status.created_at).toLocaleDateString('en-US', { 
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
