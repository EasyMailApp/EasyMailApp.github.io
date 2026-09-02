import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_PROFILE = {
  name: '',
  salutation: 'Dear Hiring Team,',
  role: '',
  phone: '',
  email: '',
  github: '',
  linkedin: '',
  portfolio: '',
  projects: '',
  phoneCb: true,
  emailCb: true,
  githubCb: true,
  linkedinCb: true,
  portfolioCb: true,
  projectsCb: true
};

const DEFAULT_SETTINGS = {
  geminiKey: '',
  geminiModel: 'gemini-2.0-flash',
  googleClientId: '',
  notificationsEnabled: true,
  resumeName: '',
  resumeData: '',
  googleAuth: null
};

const DEFAULT_APP_STATE = {
  isRunning: false
};

const LEGACY_EXTENSION_CLIENT_ID =
  '242221440831-o7hqrmppvd3rlcbk11eau6771qob1dmg.apps.googleusercontent.com';

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    return safeJsonParse(window.localStorage.getItem(key), initialValue);
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function parseJobPost(text, fallbackRole) {
  const emails = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
  const uniqueEmails = [...new Set(emails)];

  const rolePatterns = [
    /Hiring a\s+(.+?)(?=\n|$|\.)/i,
    /We're Hiring\s+(.+?)(?=\n|$|\.)/i,
    /Job Title:\s*(.+?)(?=\n|$|\.)/i,
    /Position:\s*(.+?)(?=\n|$|\.)/i,
    /Role:\s*(.+?)(?=\n|$|\.)/i,
    /Subject:\s*(.+?)(?=\n|$|\.)/i
  ];

  const companyPatterns = [
    /At\s+(.+?)(?=,|\n|$)/i,
    /Company:\s*(.+?)(?=\n|$)/i,
    /Organization:\s*(.+?)(?=\n|$)/i
  ];

  let role = '';
  for (const pattern of rolePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      role = match[1].trim();
      break;
    }
  }

  let company = '';
  for (const pattern of companyPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      company = match[1].trim();
      break;
    }
  }

  return {
    id: Date.now().toString(),
    role: role || fallbackRole || 'Unknown Role',
    company: company || 'Unknown Company',
    emails: uniqueEmails,
    text,
    generatedEmail: '',
    status: 'pending'
  };
}

function buildPrompt(job, profile) {
  let profileText = '\n\n=== CANDIDATE PROFILE ===\n';

  if (profile.name) profileText += `Name: ${profile.name}\n`;
  if (profile.role) profileText += `Role/Designation: ${profile.role}\n`;
  if (profile.phone && profile.phoneCb) profileText += `Phone: ${profile.phone}\n`;
  if (profile.email && profile.emailCb) profileText += `Email: ${profile.email}\n`;
  if (profile.github && profile.githubCb) profileText += `GitHub: ${profile.github}\n`;
  if (profile.linkedin && profile.linkedinCb) {
    profileText += `LinkedIn: ${profile.linkedin}\n`;
  }
  if (profile.portfolio && profile.portfolioCb) {
    profileText += `Portfolio: ${profile.portfolio}\n`;
  }
  if (profile.projects && profile.projectsCb) {
    profileText += 'Past Projects:\n';
    profile.projects
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        profileText += `${item}\n`;
      });
  }

  return `Write a highly concise job application email based on the following job post and candidate profile.

STRICT TEMPLATE TO FOLLOW:
${profile.salutation || 'Dear Hiring Team,'}

I am applying for the [Role from job post] position.

I have experience in [Summarize relevant skills matching the job post]. I focus on [Main goal/value proposition based on job post].

Here are some of my recent projects:
[List the candidate's Past Projects here exactly as provided in the profile. ONE URL PER LINE. Do NOT use bullet points or asterisks. Just the raw links.]

I am confident in my ability to contribute effectively as a [Role] expert.

I would love to discuss this opportunity further.

Thanks & regards,
[Candidate Name]
[If provided in profile: Phone]
[If provided in profile: Email]
[If provided in profile: LinkedIn]
[If provided in profile: GitHub]
[If provided in profile: Portfolio]

IMPORTANT:
- Keep it concise and directly usable.
- Do not add extra paragraphs.
- Keep project links as plain lines.
- Preserve any HTML that is already present in the job content.

=== JOB POST ===
${job.text}
${profileText}`;
}

function splitBase64IntoLines(base64) {
  const lines = [];
  for (let index = 0; index < base64.length; index += 76) {
    lines.push(base64.slice(index, index + 76));
  }
  return lines;
}

function buildRawEmail(job, settings) {
  const boundary = 'job_assistant_boundary';
  const to = job.emails.join(', ');
  const subject = `Application for ${job.role}`;
  const htmlMessage = job.generatedEmail.replace(/\n/g, '<br>');

  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlMessage,
    ''
  ];

  if (settings.resumeData && settings.resumeName) {
    emailLines.push(`--${boundary}`);
    emailLines.push(`Content-Type: application/pdf; name="${settings.resumeName}"`);
    emailLines.push('Content-Transfer-Encoding: base64');
    emailLines.push(
      `Content-Disposition: attachment; filename="${settings.resumeName}"`
    );
    emailLines.push('');
    emailLines.push(...splitBase64IntoLines(settings.resumeData));
    emailLines.push('');
  }

  emailLines.push(`--${boundary}--`);

  return emailLines.join('\r\n');
}

function encodeEmail(rawEmail) {
  return btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
        return;
      }

      if (Date.now() - startedAt > 10000) {
        reject(new Error('Google Identity script did not load.'));
        return;
      }

      window.setTimeout(check, 250);
    };

    check();
  });
}

function App() {
  const [activeTab, setActiveTab] = usePersistentState('jaa_active_tab', 'add-job');
  const [profile, setProfile] = usePersistentState('jaa_profile', DEFAULT_PROFILE);
  const [settings, setSettings] = usePersistentState('jaa_settings', DEFAULT_SETTINGS);
  const [jobs, setJobs] = usePersistentState('jaa_jobs', []);
  const [appState, setAppState] = usePersistentState('jaa_app_state', DEFAULT_APP_STATE);

  const [jobText, setJobText] = useState('');
  const [parsedJob, setParsedJob] = useState(null);
  const [toast, setToast] = useState(null);
  const [editorJobId, setEditorJobId] = useState(null);
  const [editorText, setEditorText] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const jobsRef = useRef(jobs);
  const profileRef = useRef(profile);
  const settingsRef = useRef(settings);
  const processingRef = useRef(false);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (settings.googleClientId === LEGACY_EXTENSION_CLIENT_ID) {
      setSettings((current) => ({
        ...current,
        googleClientId: ''
      }));
    }
  }, [settings.googleClientId, setSettings]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const reversedJobs = useMemo(() => [...jobs].reverse(), [jobs]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const updateJob = useCallback((jobId, updates) => {
    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === jobId ? { ...job, ...updates } : job))
    );
  }, [setJobs]);

  const getAccessToken = useCallback(
    async (interactive) => {
      const existingAuth = settingsRef.current.googleAuth;

      if (
        existingAuth?.accessToken &&
        existingAuth?.expiresAt &&
        existingAuth.expiresAt > Date.now() + 60000
      ) {
        return existingAuth.accessToken;
      }

      const clientId = settingsRef.current.googleClientId?.trim();
      if (!clientId) {
        throw new Error(
          'Add a Google OAuth Web Client ID in Settings and allow this site origin in Google Cloud Console.'
        );
      }

      if (clientId === LEGACY_EXTENSION_CLIENT_ID) {
        throw new Error(
          'The old Chrome extension client ID cannot be used on this website. Create a Google OAuth Web Client ID and add this site origin to Authorized JavaScript origins.'
        );
      }

      const google = await waitForGoogleIdentity();

      return new Promise((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/gmail.send',
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }

            const nextAuth = {
              accessToken: response.access_token,
              expiresAt: Date.now() + (response.expires_in || 3600) * 1000
            };

            setSettings((current) => ({
              ...current,
              googleAuth: nextAuth
            }));

            resolve(nextAuth.accessToken);
          },
          error_callback: () => {
            reject(new Error('Google sign-in failed.'));
          }
        });

        tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      });
    },
    [setSettings]
  );

  const maybeNotify = useCallback(async (title, body) => {
    if (!settingsRef.current.notificationsEnabled) {
      return;
    }

    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icon.png' });
    }
  }, []);

  const generateEmail = useCallback(
    async (jobId) => {
      const job = jobsRef.current.find((item) => item.id === jobId);
      if (!job) {
        throw new Error('Job not found.');
      }

      if (!settingsRef.current.geminiKey?.trim()) {
        throw new Error('Please add your Gemini API key in Settings.');
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${settingsRef.current.geminiModel}:generateContent?key=${settingsRef.current.geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: buildPrompt(job, profileRef.current)
                  }
                ]
              }
            ]
          })
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Gemini request failed.');
      }

      const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!generatedText) {
        throw new Error('Gemini returned an empty response.');
      }

      updateJob(jobId, {
        generatedEmail: generatedText,
        status: 'generated'
      });

      return generatedText;
    },
    [updateJob]
  );

  const sendEmail = useCallback(
    async (jobId, interactiveLogin) => {
      const job = jobsRef.current.find((item) => item.id === jobId);
      if (!job) {
        throw new Error('Job not found.');
      }

      if (!job.emails.length) {
        throw new Error('No recipient emails found for this job.');
      }

      if (!job.generatedEmail.trim()) {
        throw new Error('Generate the email before sending.');
      }

      const token = await getAccessToken(interactiveLogin);
      const raw = encodeEmail(buildRawEmail(job, settingsRef.current));

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw })
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to send the email.');
      }

      updateJob(jobId, { status: 'sent' });
    },
    [getAccessToken, updateJob]
  );

  const processNextPendingJob = useCallback(async () => {
    if (processingRef.current) {
      return;
    }

    const nextJob = jobsRef.current.find((job) => job.status === 'pending');
    if (!nextJob) {
      if (appState.isRunning) {
        setAppState({ isRunning: false });
        showToast('Queue finished.', 'success');
        await maybeNotify(
          'Queue finished',
          'All pending job applications were processed.'
        );
      }
      return;
    }

    processingRef.current = true;
    updateJob(nextJob.id, { status: 'processing' });

    try {
      if (!nextJob.generatedEmail) {
        await generateEmail(nextJob.id);
      }

      await sendEmail(nextJob.id, false);
      await maybeNotify(
        'Application sent',
        `Email sent for ${nextJob.role} at ${nextJob.company}.`
      );
    } catch (error) {
      updateJob(nextJob.id, { status: 'failed' });
      showToast(error.message, 'error');
    } finally {
      processingRef.current = false;
    }
  }, [
    appState.isRunning,
    generateEmail,
    maybeNotify,
    sendEmail,
    setAppState,
    showToast,
    updateJob
  ]);

  useEffect(() => {
    if (!appState.isRunning) {
      return undefined;
    }

    processNextPendingJob();
    const intervalId = window.setInterval(processNextPendingJob, 5000);
    return () => window.clearInterval(intervalId);
  }, [appState.isRunning, processNextPendingJob]);

  const handleParseJob = () => {
    if (!jobText.trim()) {
      showToast('Paste a job post first.', 'error');
      return;
    }

    setParsedJob(parseJobPost(jobText, profile.role.trim()));
  };

  const handleAddToQueue = () => {
    if (!parsedJob) {
      return;
    }

    const duplicate = jobs.some(
      (job) =>
        job.role.toLowerCase() === parsedJob.role.toLowerCase() &&
        job.company.toLowerCase() === parsedJob.company.toLowerCase()
    );

    if (duplicate) {
      showToast('This job is already in your queue.', 'error');
      return;
    }

    setJobs((currentJobs) => [...currentJobs, parsedJob]);
    setParsedJob(null);
    setJobText('');
    setActiveTab('queue');
    showToast('Job added to queue.', 'success');
  };

  const handleDeleteJob = (jobId) => {
    const confirmed = window.confirm('Delete this job from the queue?');
    if (!confirmed) {
      return;
    }

    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId));
    showToast('Job removed.', 'success');
  };

  const handleRetryJob = (jobId) => {
    updateJob(jobId, {
      status: 'pending',
      generatedEmail: ''
    });
    showToast('Job moved back to pending.', 'success');
  };

  const handleGenerateEmail = async (jobId) => {
    setBusyAction(`generate-${jobId}`);
    try {
      await generateEmail(jobId);
      showToast('Email generated.', 'success');
    } catch (error) {
      updateJob(jobId, { status: 'failed' });
      showToast(error.message, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const handleSendEmail = async (jobId) => {
    setBusyAction(`send-${jobId}`);
    try {
      await sendEmail(jobId, true);
      showToast('Email sent successfully.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const handleOpenEditor = (job) => {
    setEditorJobId(job.id);
    setEditorText(job.generatedEmail);
  };

  const handleSaveEditor = () => {
    updateJob(editorJobId, {
      generatedEmail: editorText,
      status: 'generated'
    });
    setEditorJobId(null);
    setEditorText('');
    showToast('Email updated.', 'success');
  };

  const handleResumeUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf') {
      showToast('Please upload a PDF resume.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = String(loadEvent.target?.result || '');
      const base64 = result.split(',')[1] || '';

      setSettings((current) => ({
        ...current,
        resumeData: base64,
        resumeName: file.name
      }));

      showToast('Resume saved locally.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadBackup = () => {
    const backup = {
      profile,
      settings: {
        ...settings,
        googleAuth: null
      },
      jobs,
      appState
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'job-application-assistant-backup.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleGoogleLogin = async () => {
    setBusyAction('google-login');

    try {
      await getAccessToken(true);
      showToast('Google account connected.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const handleStartQueue = async () => {
    setBusyAction('start-queue');

    try {
      await getAccessToken(true);
      setAppState({ isRunning: true });
      showToast('Auto processing started.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusyAction('');
    }
  };

  const handlePauseQueue = () => {
    setAppState({ isRunning: false });
    showToast('Auto processing paused.', 'info');
  };

  const loginLabel =
    settings.googleAuth?.expiresAt && settings.googleAuth.expiresAt > Date.now()
      ? 'Connected'
      : 'Connect Gmail';

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <img src="./icon.png" alt="Job Application Assistant" />
          <div>
            <p className="eyebrow">GitHub Pages Ready</p>
            <h1>Job Application Assistant</h1>
          </div>
        </div>

        <nav className="nav">
          {[
            ['add-job', 'Add'],
            ['queue', 'Queue'],
            ['profile', 'Profile'],
            ['settings', 'Settings']
          ].map(([value, label]) => (
            <button
              key={value}
              className={`nav-btn ${activeTab === value ? 'active' : ''}`}
              onClick={() => setActiveTab(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {activeTab === 'add-job' && (
          <section className="section active">
            <div className="card">
              <div className="section-head">
                <div>
                  <h2>Add Job</h2>
                  <p>Paste any job post and extract the role, company, and emails.</p>
                </div>
              </div>

              <label htmlFor="job-text">Paste Job Post</label>
              <textarea
                id="job-text"
                value={jobText}
                onChange={(event) => setJobText(event.target.value)}
                placeholder="Paste the full job description here..."
              />
              <button onClick={handleParseJob} type="button">
                Parse Job
              </button>
            </div>

            {parsedJob && (
              <div className="card">
                <div className="job-header">
                  <div>
                    <h3 className="job-role">{parsedJob.role}</h3>
                    <p className="job-company">{parsedJob.company}</p>
                  </div>
                  <span className="badge pending">pending</span>
                </div>
                <p className="muted">
                  {parsedJob.emails.length
                    ? parsedJob.emails.join(', ')
                    : 'No email addresses found'}
                </p>
                <button onClick={handleAddToQueue} type="button">
                  Add to Queue
                </button>
              </div>
            )}
          </section>
        )}

        {activeTab === 'queue' && (
          <section className="section active">
            <div className="card row-card">
              <button
                className="success"
                disabled={appState.isRunning || busyAction === 'start-queue'}
                onClick={handleStartQueue}
                type="button"
              >
                {busyAction === 'start-queue' ? 'Connecting...' : 'Start Auto'}
              </button>
              <button
                className="danger"
                disabled={!appState.isRunning}
                onClick={handlePauseQueue}
                type="button"
              >
                Pause Auto
              </button>
            </div>

            <div className="note-card">
              Queue data stays in localStorage, so it is still there after closing the
              tab. Auto-processing runs only while the website is open.
            </div>

            {reversedJobs.length === 0 ? (
              <div className="empty-state">No jobs in queue yet.</div>
            ) : (
              reversedJobs.map((job) => (
                <div className="job-item" key={job.id}>
                  <div className="job-header">
                    <div>
                      <h3 className="job-role">{job.role}</h3>
                      <p className="job-company">{job.company}</p>
                    </div>
                    <span className={`badge ${job.status}`}>{job.status}</span>
                  </div>

                  <p className="muted">
                    {job.emails.length
                      ? job.emails.join(', ')
                      : 'No email addresses found'}
                  </p>

                  <div className="job-actions">
                    {job.status === 'pending' && (
                      <button
                        disabled={busyAction === `generate-${job.id}`}
                        onClick={() => handleGenerateEmail(job.id)}
                        type="button"
                      >
                        {busyAction === `generate-${job.id}`
                          ? 'Generating...'
                          : 'Generate Email'}
                      </button>
                    )}

                    {job.status === 'generated' && (
                      <>
                        <button
                          className="secondary"
                          onClick={() => handleOpenEditor(job)}
                          type="button"
                        >
                          View / Edit
                        </button>
                        <button
                          disabled={busyAction === `send-${job.id}`}
                          onClick={() => handleSendEmail(job.id)}
                          type="button"
                        >
                          {busyAction === `send-${job.id}` ? 'Sending...' : 'Send'}
                        </button>
                      </>
                    )}

                    {job.status === 'processing' && (
                      <button disabled type="button">
                        Processing...
                      </button>
                    )}

                    {job.status === 'sent' && (
                      <button className="secondary" disabled type="button">
                        Sent
                      </button>
                    )}

                    {job.status === 'failed' && (
                      <button
                        className="secondary"
                        onClick={() => handleRetryJob(job.id)}
                        type="button"
                      >
                        Retry
                      </button>
                    )}

                    <button
                      className="secondary delete-btn"
                      onClick={() => handleDeleteJob(job.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="section active">
            <div className="card">
              <div className="section-head">
                <div>
                  <h2>Profile</h2>
                  <p>Your profile is saved to localStorage as you update it.</p>
                </div>
              </div>

              <div className="grid">
                <Field
                  label="Full Name"
                  value={profile.name}
                  onChange={(value) => setProfile({ ...profile, name: value })}
                  placeholder="John Doe"
                />

                <div className="form-group">
                  <label htmlFor="salutation">Email Salutation</label>
                  <select
                    id="salutation"
                    value={profile.salutation}
                    onChange={(event) =>
                      setProfile({ ...profile, salutation: event.target.value })
                    }
                  >
                    <option value="Dear Hiring Team,">Dear Hiring Team,</option>
                    <option value="Hi,">Hi,</option>
                    <option value="Hello,">Hello,</option>
                    <option value="To the Hiring Manager,">
                      To the Hiring Manager,
                    </option>
                  </select>
                </div>

                <Field
                  label="Designation / Role"
                  value={profile.role}
                  onChange={(value) => setProfile({ ...profile, role: value })}
                  placeholder="Software Engineer"
                />
              </div>

              <ToggleField
                label="Phone Number"
                checked={profile.phoneCb}
                value={profile.phone}
                onCheckedChange={(checked) => setProfile({ ...profile, phoneCb: checked })}
                onValueChange={(value) => setProfile({ ...profile, phone: value })}
                placeholder="+1 234 567 890"
              />

              <ToggleField
                label="Email Address"
                checked={profile.emailCb}
                value={profile.email}
                onCheckedChange={(checked) => setProfile({ ...profile, emailCb: checked })}
                onValueChange={(value) => setProfile({ ...profile, email: value })}
                placeholder="john@example.com"
              />

              <ToggleField
                label="GitHub URL"
                checked={profile.githubCb}
                value={profile.github}
                onCheckedChange={(checked) => setProfile({ ...profile, githubCb: checked })}
                onValueChange={(value) => setProfile({ ...profile, github: value })}
                placeholder="https://github.com/username"
              />

              <ToggleField
                label="LinkedIn URL"
                checked={profile.linkedinCb}
                value={profile.linkedin}
                onCheckedChange={(checked) =>
                  setProfile({ ...profile, linkedinCb: checked })
                }
                onValueChange={(value) => setProfile({ ...profile, linkedin: value })}
                placeholder="https://linkedin.com/in/username"
              />

              <ToggleField
                label="Portfolio URL"
                checked={profile.portfolioCb}
                value={profile.portfolio}
                onCheckedChange={(checked) =>
                  setProfile({ ...profile, portfolioCb: checked })
                }
                onValueChange={(value) => setProfile({ ...profile, portfolio: value })}
                placeholder="https://yourportfolio.com"
              />

              <div className="form-group">
                <div className="inline-label">
                  <label htmlFor="projects">Past Project URLs</label>
                  <input
                    checked={profile.projectsCb}
                    onChange={(event) =>
                      setProfile({ ...profile, projectsCb: event.target.checked })
                    }
                    type="checkbox"
                  />
                </div>
                <textarea
                  id="projects"
                  value={profile.projects}
                  onChange={(event) =>
                    setProfile({ ...profile, projects: event.target.value })
                  }
                  placeholder="https://project1.com&#10;https://project2.com"
                />
              </div>

              <button
                className="secondary"
                onClick={() => showToast('Profile saved locally.', 'success')}
                type="button"
              >
                Save Profile
              </button>
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="section active">
            <div className="card">
              <h2>Settings</h2>

              <Field
                label="Gemini API Key"
                type="password"
                value={settings.geminiKey}
                onChange={(value) => setSettings({ ...settings, geminiKey: value })}
                placeholder="AIzaSy..."
              />

              <Field
                label="Gemini Model"
                value={settings.geminiModel}
                onChange={(value) => setSettings({ ...settings, geminiModel: value })}
                placeholder="gemini-2.0-flash"
              />

              <Field
                label="Google OAuth Client ID"
                value={settings.googleClientId}
                onChange={(value) => setSettings({ ...settings, googleClientId: value })}
                placeholder="Google web client ID"
              />

              <div className="note-card">
                Use a Google OAuth <strong>Web application</strong> client ID here. Add
                this origin to <strong>Authorized JavaScript origins</strong>:
                <br />
                <code>{window.location.origin}</code>
              </div>

              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => showToast('API settings saved locally.', 'success')}
                  type="button"
                >
                  Save API Settings
                </button>
                <button
                  className="secondary"
                  disabled={busyAction === 'google-login'}
                  onClick={handleGoogleLogin}
                  type="button"
                >
                  {busyAction === 'google-login' ? 'Connecting...' : loginLabel}
                </button>
              </div>
            </div>

            <div className="card">
              <label htmlFor="resume-upload">Resume (PDF)</label>
              <label className="file-upload" htmlFor="resume-upload">
                <span>{settings.resumeName || 'Click to upload your resume PDF'}</span>
              </label>
              <input
                className="hidden-input"
                id="resume-upload"
                onChange={handleResumeUpload}
                accept="application/pdf"
                type="file"
              />
              {settings.resumeName && (
                <p className="file-name">Attached: {settings.resumeName}</p>
              )}
            </div>

            <div className="card">
              <div className="inline-label">
                <label htmlFor="notificationsEnabled">Show Notifications</label>
                <input
                  id="notificationsEnabled"
                  checked={settings.notificationsEnabled}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      notificationsEnabled: event.target.checked
                    })
                  }
                  type="checkbox"
                />
              </div>
            </div>

            <div className="card">
              <h3>Backup</h3>
              <p className="muted">
                Download a JSON backup of your jobs, profile, and saved settings.
              </p>
              <button className="secondary" onClick={handleDownloadBackup} type="button">
                Download Backup JSON
              </button>
            </div>

            <div className="note-card">
              For Gmail sending on GitHub Pages, your Google OAuth web client must allow
              your deployed site origin in Google Cloud Console.
            </div>
          </section>
        )}
      </main>

      {editorJobId && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Edit Generated Email</h3>
            <textarea
              value={editorText}
              onChange={(event) => setEditorText(event.target.value)}
              placeholder="Edit the generated email here..."
            />
            <div className="button-row">
              <button className="secondary" onClick={() => setEditorJobId(null)} type="button">
                Cancel
              </button>
              <button onClick={handleSaveEditor} type="button">
                Save Email
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? `show ${toast.type}` : ''}`}>
        {toast?.message || ''}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ToggleField({
  label,
  checked,
  value,
  onCheckedChange,
  onValueChange,
  placeholder
}) {
  return (
    <div className="form-group">
      <div className="inline-label">
        <label>{label}</label>
        <input
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          type="checkbox"
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default App;
