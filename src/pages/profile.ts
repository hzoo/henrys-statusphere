import { 
  initializeOAuth, 
  checkExistingSession,
  getCurrentSession,
} from "./oauth.ts";
import type { StatusRecord, Profile } from "../types";

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const loadingProfile = document.getElementById('loading-profile') as HTMLElement;
const profileInfo = document.getElementById('profile-info') as HTMLElement;
const profileError = document.getElementById('profile-error') as HTMLElement;
const profileHandle = document.getElementById('profile-handle') as HTMLElement;
const profileDescription = document.getElementById('profile-description') as HTMLElement;
const pageTitle = document.getElementById('page-title') as HTMLElement;

const loadingStatuses = document.getElementById('loading-statuses') as HTMLElement;
const statusList = document.getElementById('status-list') as HTMLElement;
const noStatuses = document.getElementById('no-statuses') as HTMLElement;

document.addEventListener('DOMContentLoaded', async () => {
  initializeOAuth();
  await checkExistingSession();
  
  const handle = getHandleFromUrl();
  if (!handle) {
    showProfileError();
    return;
  }
  
  try {
    const profile = await fetchProfile(handle as string);
    showProfile(profile);
    await loadUserStatuses(profile.did);
  } catch (error) {
    console.error('Failed to load profile:', error);
    showProfileError();
  }
});

function getHandleFromUrl(): string | null {
  const path = window.location.pathname;
  const match = path.match(/\/profile\/(.+)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

async function fetchProfile(handle: string): Promise<Profile> {
  const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${handle}`);
  if (!response.ok) {
    throw new Error('Profile not found');
  }
  const data = await response.json();
  return {
    handle: data.handle,
    displayName: data.displayName,
    avatar: data.avatar,
    did: data.did,
  };
}

function showProfile(profile: Profile): void {
  loadingProfile.classList.add('hidden');
  profileInfo.classList.remove('hidden');
  
  profileHandle.textContent = `@${profile.handle}`;
  pageTitle.textContent = `${profile.displayName || profile.handle} - Statusphere`;
  
  if (profile.displayName) {
    profileDescription.textContent = profile.displayName;
    profileDescription.classList.remove('hidden');
  }
}

function showProfileError(): void {
  loadingProfile.classList.add('hidden');
  profileError.classList.remove('hidden');
  loadingStatuses.classList.add('hidden');
}

async function loadUserStatuses(userDid: string): Promise<void> {
  try {
    const currentSession = getCurrentSession();
    let userStatuses: StatusRecord[] = [];
    
    // If viewing own profile, fetch complete history from PDS
    if (currentSession && currentSession.did === userDid) {
      try {
        const { ok, data } = await (currentSession.rpc as any).get("com.atproto.repo.listRecords", {
          params: {
            repo: userDid,
            collection: "xyz.statusphere.status",
            limit: 100
          }
        });
        
        if (ok && data.records) {
          userStatuses = data.records.map((record: any) => ({
            uri: record.uri,
            did: userDid,
            status: record.value.status,
            created_at: record.value.createdAt,
          }));
        }
      } catch (pdsError) {
        console.warn('Failed to fetch from PDS, falling back to local data:', pdsError);
        // Fall back to local database
        const response = await fetch('/api/statuses');
        const allStatuses = await response.json() as StatusRecord[];
        userStatuses = allStatuses.filter(status => status.did === userDid);
      }
    } else {
      // For other users, use local database - reuse the same data if already fetched
      const response = await fetch('/api/statuses');
      const allStatuses = await response.json() as StatusRecord[];
      userStatuses = allStatuses.filter(status => status.did === userDid);
    }
    
    loadingStatuses.classList.add('hidden');
    
    if (userStatuses.length === 0) {
      noStatuses.classList.remove('hidden');
      statusList.classList.add('hidden');
    } else {
      noStatuses.classList.add('hidden');
      statusList.classList.remove('hidden');
      renderStatuses(userStatuses, userDid);
    }
  } catch (error) {
    console.error('Failed to load statuses:', error);
    loadingStatuses.innerHTML = '<span class="text-red-500">Failed to load statuses</span>';
  }
}

function renderStatuses(statuses: StatusRecord[], userDid: string): void {
  const currentSession = getCurrentSession();
  const isOwnProfile = currentSession && currentSession.did === userDid;
  
  statusList.innerHTML = statuses.map(status => {
    const deleteButton = isOwnProfile 
      ? `<button class="delete-btn text-xs text-red-500 hover:text-red-700 ml-2" data-uri="${escapeHtml(status.uri)}">×</button>`
      : '';
    
    const atpToolsLink = `https://atp.tools/${encodeURIComponent(status.uri)}`;
    
    return `
      <div class="flex items-center justify-between text-sm p-2 border border-gray-200 rounded">
        <div class="flex items-center space-x-2">
          <span class="text-lg">${escapeHtml(status.status)}</span>
          <span class="text-xs text-gray-500">
            ${new Date(status.created_at).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
          <a href="${atpToolsLink}" target="_blank" class="text-xs text-gray-400 hover:text-gray-600" title="View on ATP Tools">↗</a>
        </div>
        ${deleteButton}
      </div>
    `;
  }).join('');
  
  // Add delete functionality if it's the user's own profile
  if (isOwnProfile) {
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uri = (e.target as HTMLElement).dataset.uri!;
        await deleteStatus(uri);
      });
    });
  }
}

async function deleteStatus(uri: string): Promise<void> {
  const currentSession = getCurrentSession();
  if (!currentSession) return;
  
  if (!confirm('Delete this status?')) return;
  
  try {
    // Extract rkey from URI format: at://did/collection/rkey
    const rkey = uri.split('/').pop()!;
    
    const { ok, data } = await (currentSession.rpc as any).post("com.atproto.repo.deleteRecord", {
      input: {
        repo: currentSession.did,
        collection: "xyz.statusphere.status",
        rkey: rkey,
      },
    });
    
    if (!ok) {
      throw new Error(`Error deleting status: ${data.error}`);
    }
    
    // Reload statuses after successful deletion
    setTimeout(() => loadUserStatuses(currentSession.did), 1000);
    
  } catch (error) {
    console.error('Failed to delete status:', error);
    alert('Failed to delete status. Please try again.');
  }
}