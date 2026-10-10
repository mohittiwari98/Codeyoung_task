// Single place that knows how to build links into the React app.
export const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
export const classUrl = (id, query) => `${appUrl()}/#/class/${id}?${query}`;
export const mentorScheduleUrl = (token) => `${appUrl()}/#/mentor/${token}`;
