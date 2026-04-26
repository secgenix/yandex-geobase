# Yandex GeoBase - Frontend Documentation

## 📋 Overview

The frontend provides a complete web interface for the Yandex GeoBase application with authentication, user profiles, and admin dashboard functionality.

## 📁 Project Structure

```
frontend/
├── templates/
│   ├── index.html           # Main map interface
│   ├── login.html           # User login page
│   ├── register.html        # User registration page
│   ├── profile.html         # User profile page
│   └── admin.html           # Admin dashboard
├── static/
│   ├── css/
│   │   ├── style.css        # Main map styling
│   │   ├── auth.css         # Authentication pages styling
│   │   ├── dashboard.css    # Dashboard layout styling
│   │   └── admin.css        # Admin-specific styling
│   └── js/
│       ├── script.js        # Main map script
│       ├── login.js         # Login functionality
│       ├── register.js      # Registration functionality
│       ├── profile.js       # Profile management
│       └── admin.js         # Admin dashboard
└── README.md               # This file
```

## 🔐 Authentication Pages

### Login (login.html)
- User login with email/username and password
- "Remember me" functionality
- Form validation
- Error handling and display
- Automatic redirect to admin dashboard for admins

### Registration (register.html)
- New user registration
- Password strength validation
- Confirmation password check
- Terms and conditions acceptance
- Email validation

## 👤 User Pages

### Profile (profile.html)
- View user information (username, email, name, roles, permissions)
- Change password with validation
- View active sessions
- Account status display
- Last login information

### Main Map (index.html)
- Geographic object visualization on map
- Search functionality
- Object filtering
- Dynamic navigation header
- Authentication-aware navigation

## 🔐 Admin Dashboard (admin.html)

### Sections:
1. **Dashboard Overview**
   - Statistics cards (users, roles, permissions, labels)
   - Quick access to all management sections

2. **User Management**
   - List all users with pagination
   - Search and filter by status
   - View, edit, delete users
   - Assign/revoke roles

3. **Role Management**
   - View all system and custom roles
   - Create new roles
   - Edit role permissions
   - Delete custom roles
   - System roles are protected

4. **Permission Management**
   - View all available permissions
   - Filter by category
   - Categorized permission display

5. **Label Management**
   - Create and manage labels
   - Color-coded labels
   - Icon support
   - Assign labels to objects

6. **Audit Logs**
   - View all administrative actions
   - Filter by user, action, resource type, status
   - Timestamp tracking
   - Success/error indicators

## 📱 Responsive Design

All pages are fully responsive:
- Mobile-first approach
- Tablet optimization
- Desktop enhancement
- Touch-friendly interfaces

## 🎨 Styling System

### CSS Files:
- **style.css** - Main layout and map interface
- **auth.css** - Authentication page styling with gradient backgrounds
- **dashboard.css** - Navigation, sidebar, main content layout
- **admin.css** - Admin-specific components and styling

### Colors:
- Primary: #667eea
- Dark: #2c3e50
- Accent: #ff6b00
- Success: #27ae60
- Danger: #e74c3c
- Warning: #f39c12

## 🔌 API Integration

All pages integrate with the FastAPI backend at `/api/v1`:

### Authentication Endpoints:
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/logout` - User logout
- `POST /auth/change-password` - Change password
- `GET /auth/me` - Get current user info
- `POST /auth/refresh` - Refresh token

### Admin Endpoints:
- `GET /admin/users` - List users
- `GET /admin/roles` - List roles
- `GET /admin/permissions` - List permissions
- `GET /admin/labels` - List labels
- `GET /admin/logs` - View audit logs

## 🔒 Authentication & Authorization

### Token Management:
- JWT tokens stored in localStorage
- `access_token` - JWT authentication token
- `token_type` - Token type (bearer)
- Automatic redirect to login if token expired

### Role-Based Access:
- Users can access only their own profile
- Admin users get access to admin dashboard
- Admin check before loading admin pages
- Protected endpoints return 401 for unauthorized access

## 📝 Form Validation

### Password Requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit

### Email Validation:
- HTML5 email validation
- Backend validation

## 🚀 Features

### User Experience:
- Loading indicators
- Error messages with details
- Success notifications
- Confirmation dialogs for destructive actions
- Empty state messages
- Pagination for large datasets

### Admin Features:
- Batch operations capability
- Role hierarchy protection
- Audit trail tracking
- Comprehensive search and filtering
- Status indicators
- Action confirmation dialogs

## 🔍 Key JavaScript Functionality

### Authentication:
```javascript
// Store token
localStorage.setItem('access_token', token);

// Make authenticated request
fetch(url, {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});
```

### Error Handling:
```javascript
try {
    // API call
} catch (error) {
    // Display error
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
}
```

### Dynamic Navigation:
```javascript
// Update header based on auth status
if (token) {
    // Show logged in UI
} else {
    // Show login/register links
}
```

## 📚 Common Tasks

### Add New Admin Section:
1. Add menu item to `.sidebar-menu` in admin.html
2. Create new `<section>` with unique ID
3. Create load function in admin.js
4. Wire up the handler in `setupEventListeners()`

### Modify Form:
1. Update form HTML
2. Add validation in JavaScript
3. Handle submission event
4. Call appropriate API endpoint

### Add New API Integration:
1. Create fetch request with proper headers
2. Parse JSON response
3. Handle errors appropriately
4. Update UI with results

## 🐛 Debugging

### Check Authentication:
```javascript
console.log(localStorage.getItem('access_token'));
console.log(JSON.parse(localStorage.getItem('user')));
```

### Monitor Network:
- Open browser DevTools (F12)
- Check Network tab for API calls
- Verify response status codes

## 🔄 Future Enhancements

- [ ] Two-factor authentication
- [ ] Gravatar profile pictures
- [ ] Dark mode
- [ ] Internationalization (i18n)
- [ ] Real-time notifications
- [ ] Advanced analytics dashboard
- [ ] Export functionality
- [ ] Bulk operations

## 📞 Support

For issues or questions, refer to the backend API documentation or create an issue in the project repository.
