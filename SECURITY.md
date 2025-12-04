# Security Policy

Thank you for helping us keep AI Cognitive Suite secure.

## About This Project

AI Cognitive Suite provides advanced Model Context Protocol (MCP) servers for contextual memory management and adaptive reasoning capabilities in AI workflows.

## Security Considerations

### Data Storage Security
- **Contextual Memory Server**: Stores knowledge graphs and entity relationships in local JSON files
- **Adaptive Reasoning Server**: Stores thinking sessions and thought processes in local JSON files
- **File Permissions**: Ensure appropriate file system permissions for your `MEMORY_PATH` directory
- **Sensitive Data**: Be mindful of storing sensitive information in memory branches or thinking sessions

### Environment Variables
- `MEMORY_PATH`: Should point to a secure directory with appropriate access controls
- `DISABLE_THOUGHT_LOGGING`: Can be used to prevent console logging of sensitive thought content

### Best Practices
1. **Secure Storage Location**: Use a dedicated, secured directory for `MEMORY_PATH`
2. **Access Controls**: Implement proper file system permissions
3. **Data Classification**: Be aware of what information is stored in memory branches
4. **Regular Backups**: Maintain secure backups of important memory data
5. **Environment Isolation**: Use separate memory paths for different projects/environments
6. **Network Security**: Ensure MCP server endpoints are properly secured
7. **Authentication**: Implement appropriate authentication mechanisms for production use

## Reporting Security Issues

For security issues in AI Cognitive Suite:

1. **Do not** create public GitHub issues for security vulnerabilities
2. Email security concerns to: kai@prismaquatics.io
3. Include "SECURITY" in the subject line
4. Provide detailed information about the vulnerability
5. Allow reasonable time for investigation and resolution

We will acknowledge receipt within 48 hours and provide regular updates on our progress.

## Supported Versions

| Server | Version | Supported |
|--------|---------|-----------|
| Contextual Memory Server | 2.4.1+ | ✅ |
| Adaptive Reasoning Server | 2.4.1+ | ✅ |

## Security Updates

Security updates will be released as patch versions and documented in the changelog. Users are encouraged to keep their servers updated to the latest versions.

## Responsible Disclosure

We appreciate responsible disclosure of security vulnerabilities. We commit to:
- Acknowledging your report promptly
- Keeping you informed of our progress
- Crediting you appropriately (if desired) when we release a fix
- Working with you to understand and resolve the issue

Thank you for helping keep AI Cognitive Suite secure for everyone.
