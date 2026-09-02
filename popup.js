// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  const navBtns = document.querySelectorAll('.nav-btn');
  const sections = document.querySelectorAll('.section');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      navBtns.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
      if (target === 'queue') loadQueue();
    });
  });

  // Settings elements
  const geminiKeyInput = document.getElementById('gemini-key');
  const saveKeyBtn = document.getElementById('save-key');
  const loginGoogleBtn = document.getElementById('login-google');
  const resumeUpload = document.getElementById('resume-upload');
  const fileNameDisplay = document.getElementById('file-name');
  const downloadJsonBtn = document.getElementById('download-json');

  // Profile elements
  const profName = document.getElementById('prof-name');
  const profSalutation = document.getElementById('prof-salutation');
  const profRole = document.getElementById('prof-role');
  const profPhone = document.getElementById('prof-phone');
  const profEmail = document.getElementById('prof-email');
  const profGithub = document.getElementById('prof-github');
  const profLinkedin = document.getElementById('prof-linkedin');
  const profPortfolio = document.getElementById('prof-portfolio');
  const profProjects = document.getElementById('prof-projects');
  
  const profPhoneCb = document.getElementById('prof-phone-cb');
  const profEmailCb = document.getElementById('prof-email-cb');
  const profGithubCb = document.getElementById('prof-github-cb');
  const profLinkedinCb = document.getElementById('prof-linkedin-cb');
  const profPortfolioCb = document.getElementById('prof-portfolio-cb');
  const profProjectsCb = document.getElementById('prof-projects-cb');
  
  const saveProfileBtn = document.getElementById('save-profile');
  const notificationsToggle = document.getElementById('setting-notifications');

  // Load initial settings
  chrome.storage.local.get(['geminiKey', 'resumeName', 'googleToken', 'profile', 'notificationsEnabled'], (data) => {
    if (data.geminiKey) geminiKeyInput.value = data.geminiKey;
    if (data.notificationsEnabled !== undefined && notificationsToggle) {
      notificationsToggle.checked = data.notificationsEnabled;
    }
    if (data.resumeName) fileNameDisplay.textContent = `Attached: ${data.resumeName}`;
    if (data.googleToken) {
      loginGoogleBtn.textContent = 'Logged In ✓';
      loginGoogleBtn.classList.add('secondary');
    }
    if (data.profile) {
      profName.value = data.profile.name || '';
      if (data.profile.salutation) profSalutation.value = data.profile.salutation;
      profRole.value = data.profile.role || '';
      profPhone.value = data.profile.phone || '';
      profEmail.value = data.profile.email || '';
      profGithub.value = data.profile.github || '';
      profLinkedin.value = data.profile.linkedin || '';
      profPortfolio.value = data.profile.portfolio || '';
      profProjects.value = data.profile.projects || '';

      if (data.profile.phoneCb !== undefined) profPhoneCb.checked = data.profile.phoneCb;
      if (data.profile.emailCb !== undefined) profEmailCb.checked = data.profile.emailCb;
      if (data.profile.githubCb !== undefined) profGithubCb.checked = data.profile.githubCb;
      if (data.profile.linkedinCb !== undefined) profLinkedinCb.checked = data.profile.linkedinCb;
      if (data.profile.portfolioCb !== undefined) profPortfolioCb.checked = data.profile.portfolioCb;
      if (data.profile.projectsCb !== undefined) profProjectsCb.checked = data.profile.projectsCb;
    }
  });

  // Save Profile
  saveProfileBtn.addEventListener('click', () => {
    const profile = {
      name: profName.value,
      salutation: profSalutation.value,
      role: profRole.value,
      phone: profPhone.value,
      email: profEmail.value,
      github: profGithub.value,
      linkedin: profLinkedin.value,
      portfolio: profPortfolio.value,
      projects: profProjects.value,
      phoneCb: profPhoneCb.checked,
      emailCb: profEmailCb.checked,
      githubCb: profGithubCb.checked,
      linkedinCb: profLinkedinCb.checked,
      portfolioCb: profPortfolioCb.checked,
      projectsCb: profProjectsCb.checked
    };
    chrome.storage.local.set({ profile }, () => {
      showToast('Profile saved!', 'success');
    });
  });

  // Save Gemini Key
  saveKeyBtn.addEventListener('click', () => {
    chrome.storage.local.set({ geminiKey: geminiKeyInput.value }, () => {
      showToast('API Key saved!', 'success');
    });
  });

  // Save Notifications
  if (notificationsToggle) {
    notificationsToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ notificationsEnabled: e.target.checked });
    });
  }

  // Login with Google
  loginGoogleBtn.addEventListener('click', () => {
    setLoading(loginGoogleBtn, true);
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      setLoading(loginGoogleBtn, false, 'Login with Google');
      if (chrome.runtime.lastError) {
        showToast(chrome.runtime.lastError.message, 'error');
        return;
      }
      chrome.storage.local.set({ googleToken: token }, () => {
        loginGoogleBtn.textContent = 'Logged In ✓';
        loginGoogleBtn.classList.add('secondary');
        showToast('Successfully logged in!', 'success');
      });
    });
  });

  // Upload Resume
  resumeUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showToast('Please upload a PDF file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result.split(',')[1];
      chrome.storage.local.set({ 
        resumeData: base64,
        resumeName: file.name
      }, () => {
        fileNameDisplay.textContent = `Attached: ${file.name}`;
        showToast('Resume uploaded!', 'success');
      });
    };
    reader.readAsDataURL(file);
  });

  // Download JSON
  downloadJsonBtn.addEventListener('click', () => {
    chrome.storage.local.get(['jobs'], (data) => {
      const jobs = data.jobs || [];
      const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: 'job-applications.json',
        saveAs: true
      });
    });
  });

  // Add Job elements
  const jobTextInput = document.getElementById('job-text');
  const parseJobBtn = document.getElementById('parse-job');
  const addToQueueBtn = document.getElementById('add-to-queue');
  const extractedInfo = document.getElementById('extracted-info');
  
  let currentParsedJob = null;

  parseJobBtn.addEventListener('click', () => {
    const text = jobTextInput.value;
    if (!text.trim()) {
      showToast('Please paste a job post', 'error');
      return;
    }

    const emails = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
    const uniqueEmails = [...new Set(emails)];

    const rolePatterns = [
      /Hiring a\s+(.+?)(?=\n|$|\.)/i,
      /We're Hiring\s+(.+?)(?=\n|$|\.)/i,
      /Job Title:\s*(.+?)(?=\n|$|\.)/i,
      /Position:\s*(.+?)(?=\n|$|\.)/i,
      /Subject:\s*(.+?)(?=\n|$|\.)/i,
      /Role:\s*(.+?)(?=\n|$|\.)/i
    ];

    let role = '';
    for (const pattern of rolePatterns) {
      const match = text.match(pattern);
      if (match) {
        role = match[1];
        break;
      }
    }

    if (!role) {
      // Fallback to profile designation
      role = (profRole && profRole.value) ? profRole.value.trim() : '';
    }

    if (!role) {
      role = 'Unknown Role';
    }

    const companyMatch = text.match(/At\s+(.+?),/i);
    const company = companyMatch ? companyMatch[1] : 'Unknown Company';

    currentParsedJob = {
      id: Date.now().toString(),
      role: role.trim(),
      company: company.trim(),
      emails: uniqueEmails,
      text: text,
      generatedEmail: "",
      status: "pending"
    };

    document.getElementById('ext-role').textContent = currentParsedJob.role;
    document.getElementById('ext-company').textContent = currentParsedJob.company;
    document.getElementById('ext-emails').textContent = currentParsedJob.emails.length > 0 ? currentParsedJob.emails.join(', ') : 'None found';
    
    extractedInfo.style.display = 'flex';
    addToQueueBtn.disabled = false;
  });

  addToQueueBtn.addEventListener('click', () => {
    if (!currentParsedJob) return;
    
    chrome.storage.local.get(['jobs'], (data) => {
      const jobs = data.jobs || [];
      // Prevent duplicates based on role and company
      const isDuplicate = jobs.some(j => j.role === currentParsedJob.role && j.company === currentParsedJob.company);
      if (isDuplicate) {
        showToast('Job already in queue!', 'error');
        return;
      }

      jobs.push(currentParsedJob);
      chrome.storage.local.set({ jobs }, () => {
        showToast('Added to queue!', 'success');
        jobTextInput.value = '';
        extractedInfo.style.display = 'none';
        currentParsedJob = null;
        addToQueueBtn.disabled = true;
        
        // Switch to queue tab
        navBtns[1].click();
      });
    });
  });

  // Queue Management
  const queueList = document.getElementById('queue-list');
  const startQueueBtn = document.getElementById('start-queue');
  const pauseQueueBtn = document.getElementById('pause-queue');

  if (startQueueBtn && pauseQueueBtn) {
    chrome.storage.local.get(['appState'], (data) => {
      if (data.appState && data.appState.isRunning) {
        startQueueBtn.disabled = true;
        pauseQueueBtn.disabled = false;
      } else {
        startQueueBtn.disabled = false;
        pauseQueueBtn.disabled = true;
      }
    });

    startQueueBtn.addEventListener('click', () => {
      chrome.storage.local.get(['jobs'], (data) => {
        const jobs = data.jobs || [];
        let modified = false;
        jobs.forEach(j => {
          if (j.status === 'failed') {
            j.status = 'pending';
            j.generatedEmail = ""; // full fresh retry
            modified = true;
          }
        });
        
        const startProcessing = () => {
          chrome.storage.local.set({ appState: { isRunning: true } }, () => {
            startQueueBtn.disabled = true;
            pauseQueueBtn.disabled = false;
            showToast(modified ? 'Auto processing started (retrying failed)' : 'Auto processing started', 'success');
            chrome.runtime.sendMessage({ action: "runQueue" });
          });
        };

        if (modified) {
          chrome.storage.local.set({ jobs }, startProcessing);
        } else {
          startProcessing();
        }
      });
    });

    pauseQueueBtn.addEventListener('click', () => {
      chrome.storage.local.set({ appState: { isRunning: false } }, () => {
        startQueueBtn.disabled = false;
        pauseQueueBtn.disabled = true;
        showToast('Auto processing paused', 'info');
      });
    });
  }

  function loadQueue() {
    chrome.storage.local.get(['jobs'], (data) => {
      const jobs = data.jobs || [];
      queueList.innerHTML = '';

      if (jobs.length === 0) {
        queueList.innerHTML = '<div class="empty-state">No jobs in queue</div>';
        return;
      }

      // Reverse so newest is first
      jobs.slice().reverse().forEach(job => {
        const item = document.createElement('div');
        item.className = 'job-item';
        
        let actionsHtml = '';
        if (job.status === 'pending') {
          actionsHtml = `<button class="gen-email-btn" data-id="${job.id}">Generate Email</button>`;
        } else if (job.status === 'generated') {
          actionsHtml = `
            <button class="view-email-btn secondary" data-id="${job.id}">View/Edit</button>
            <button class="send-email-btn" data-id="${job.id}">Send Email</button>
          `;
        } else if (job.status === 'sent') {
          actionsHtml = `<button class="secondary" disabled>Sent ✓</button>`;
        } else if (job.status === 'failed') {
          actionsHtml = `<button class="retry-job-btn secondary" style="color: var(--danger); border-color: var(--danger);" data-id="${job.id}">Retry ↻</button>`;
        }

        item.innerHTML = `
          <div class="job-header">
            <div>
              <h3 class="job-role">${job.role}</h3>
              <p class="job-company">${job.company}</p>
            </div>
            <span class="badge ${job.status}">${job.status}</span>
          </div>
          ${job.emails.length > 0 ? `<p style="font-size:12px; color:var(--text-muted); margin:8px 0 0 0;">${job.emails.join(', ')}</p>` : `<p style="font-size:12px; color:var(--danger); margin:8px 0 0 0;">No emails extracted</p>`}
          <div class="job-actions">
            ${actionsHtml}
            <button class="delete-job-btn secondary" style="flex: 0 0 auto; padding: 6px 10px;" data-id="${job.id}">✕</button>
          </div>
        `;

        queueList.appendChild(item);
      });

      // Bind events
      document.querySelectorAll('.gen-email-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleGenerateEmail(e.target.dataset.id, e.target));
      });
      document.querySelectorAll('.send-email-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleSendEmail(e.target.dataset.id, e.target));
      });
      document.querySelectorAll('.retry-job-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleRetryJob(e.target.dataset.id));
      });
      document.querySelectorAll('.delete-job-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleDeleteJob(e.target.dataset.id));
      });
      document.querySelectorAll('.view-email-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleViewEmail(e.target.dataset.id));
      });
    });
  }

  async function handleGenerateEmail(jobId, btnElement) {
    setLoading(btnElement, true);
    
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "generateEmail", jobId: jobId }, (res) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (res && res.error) return reject(new Error(res.error));
          resolve(res);
        });
      });
      showToast('Email generated!', 'success');
      loadQueue();
    } catch (err) {
      showToast(err.message || 'Failed to generate email', 'error');
    } finally {
      setLoading(btnElement, false, 'Generate Email');
    }
  }

  function handleViewEmail(jobId) {
    chrome.storage.local.get(['jobs'], (data) => {
      const jobs = data.jobs || [];
      const jobIndex = jobs.findIndex(j => j.id === jobId);
      if (jobIndex === -1) return;
      
      const edited = prompt("Edit your email:", jobs[jobIndex].generatedEmail);
      if (edited !== null) {
        jobs[jobIndex].generatedEmail = edited;
        chrome.storage.local.set({ jobs }, () => {
          showToast('Email updated', 'success');
        });
      }
    });
  }

  function handleDeleteJob(jobId) {
    if (!confirm('Are you sure you want to delete this job?')) return;
    chrome.storage.local.get(['jobs'], (data) => {
      const jobs = data.jobs || [];
      const updatedJobs = jobs.filter(j => j.id !== jobId);
      chrome.storage.local.set({ jobs: updatedJobs }, () => {
        loadQueue();
        showToast('Job removed', 'success');
      });
    });
  }

  async function handleSendEmail(jobId, btnElement) {
    setLoading(btnElement, true);
    
    try {
      // Send message to background script to handle auth and API call cleanly
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "sendEmail", jobId: jobId }, (res) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (res && res.error) return reject(new Error(res.error));
          resolve(res);
        });
      });
      
      showToast('Email sent successfully!', 'success');
      loadQueue();
    } catch (err) {
      showToast(err.message || 'Failed to send email', 'error');
      setLoading(btnElement, false, 'Send Email');
    }
  }

  function handleRetryJob(jobId) {
    chrome.storage.local.get(['jobs'], (data) => {
      const jobs = data.jobs || [];
      const jobIndex = jobs.findIndex(j => j.id === jobId);
      if (jobIndex !== -1) {
        jobs[jobIndex].status = 'pending';
        // Clear previous generated email to force a full fresh retry
        jobs[jobIndex].generatedEmail = ""; 
        chrome.storage.local.set({ jobs }, () => {
          showToast('Job queued for retry', 'success');
          loadQueue();
          
          // If queue is running, trigger it
          chrome.storage.local.get(['appState'], (stateData) => {
            if (stateData.appState && stateData.appState.isRunning) {
               chrome.runtime.sendMessage({ action: "runQueue" });
            }
          });
        });
      }
    });
  }

  // Utilities
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function setLoading(btn, isLoading, originalText = '') {
    if (isLoading) {
      btn.disabled = true;
      btn.dataset.original = btn.textContent;
      btn.innerHTML = '<span class="loader"></span>';
    } else {
      btn.disabled = false;
      btn.textContent = originalText || btn.dataset.original;
    }
  }

  // Listen for background updates
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.jobs) {
        // Update UI if the queue is open
        const queueTab = document.getElementById('queue');
        if (queueTab && queueTab.classList.contains('active')) {
          loadQueue();
        }
      }
      if (changes.appState) {
        const state = changes.appState.newValue;
        const startQueueBtn = document.getElementById('start-queue');
        const pauseQueueBtn = document.getElementById('pause-queue');
        if (state && startQueueBtn && pauseQueueBtn) {
          if (state.isRunning) {
            startQueueBtn.disabled = true;
            pauseQueueBtn.disabled = false;
          } else {
            startQueueBtn.disabled = false;
            pauseQueueBtn.disabled = true;
          }
        }
      }
    }
  });
});
