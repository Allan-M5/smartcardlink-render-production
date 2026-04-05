from pathlib import Path
import re

path = Path(r"C:\Users\ADMIN\Desktop\smartcardlink-app\server.js")
text = path.read_text(encoding="utf-8")

if "const normalizeComparableUrl =" not in text:
    text = text.replace(
        """const getSlugFromUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        return String(parsed.searchParams.get('slug') || '').trim();
    } catch (error) {
        return '';
    }
};
""",
        """const getSlugFromUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        return String(parsed.searchParams.get('slug') || '').trim();
    } catch (error) {
        return '';
    }
};

const normalizeComparableUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        parsed.hash = '';
        return parsed.toString().replace(/\\/+$, '');
    } catch (error) {
        return String(value || '').trim().replace(/\\/+$, '');
    }
};
"""
    )

if "const normalizeWorkingHours =" not in text:
    text = text.replace(
        """const ensureColor = (value) => {
    const color = String(value || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : '#FFD700';
};
""",
        """const ensureColor = (value) => {
    const color = String(value || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : '#FFD700';
};

const normalizeWorkingHours = (hours = {}) => {
    const clean = (value) => String(value || '').trim();

    return {
        monFriStart: clean(hours.monFriStart) || '08:00',
        monFriEnd: clean(hours.monFriEnd) || '17:00',
        satStart: clean(hours.satStart) || '09:00',
        satEnd: clean(hours.satEnd) || '12:00',
        sunStart: clean(hours.sunStart),
        sunEnd: clean(hours.sunEnd),
    };
};
"""
    )

text = text.replace(
    """        const expectedUrl = String(client.vcardUrl || '').trim();
        if (!expectedUrl || accessToken !== expectedUrl) {
            return respError(res, 'Access token does not match this profile.', 403);
        }
""",
    """        const expectedUrl = normalizeComparableUrl(client.vcardUrl || '');
        const suppliedUrl = normalizeComparableUrl(accessToken);

        if (!expectedUrl || suppliedUrl !== expectedUrl) {
            return respError(res, 'Access token does not match this profile.', 403);
        }
"""
)

text = text.replace(
    """    const hours = incoming.workingHours || {};
    client.workingHours.monFriStart = String(hours.monFriStart || incoming.monFriStart || '').trim();
    client.workingHours.monFriEnd = String(hours.monFriEnd || incoming.monFriEnd || '').trim();
    client.workingHours.satStart = String(hours.satStart || incoming.satStart || '').trim();
    client.workingHours.satEnd = String(hours.satEnd || incoming.satEnd || '').trim();
    client.workingHours.sunStart = String(hours.sunStart || incoming.sunStart || '').trim();
    client.workingHours.sunEnd = String(hours.sunEnd || incoming.sunEnd || '').trim();
""",
    """    const hours = normalizeWorkingHours({
        monFriStart: incoming.workingHours && incoming.workingHours.monFriStart || incoming.monFriStart || '',
        monFriEnd: incoming.workingHours && incoming.workingHours.monFriEnd || incoming.monFriEnd || '',
        satStart: incoming.workingHours && incoming.workingHours.satStart || incoming.satStart || '',
        satEnd: incoming.workingHours && incoming.workingHours.satEnd || incoming.satEnd || '',
        sunStart: incoming.workingHours && incoming.workingHours.sunStart || incoming.sunStart || '',
        sunEnd: incoming.workingHours && incoming.workingHours.sunEnd || incoming.sunEnd || ''
    });

    client.workingHours.monFriStart = hours.monFriStart;
    client.workingHours.monFriEnd = hours.monFriEnd;
    client.workingHours.satStart = hours.satStart;
    client.workingHours.satEnd = hours.satEnd;
    client.workingHours.sunStart = hours.sunStart;
    client.workingHours.sunEnd = hours.sunEnd;
"""
)

text = text.replace(
    """            workingHours: {
                monFriStart: String(payload.workingHours && payload.workingHours.monFriStart || '').trim(),
                monFriEnd: String(payload.workingHours && payload.workingHours.monFriEnd || '').trim(),
                satStart: String(payload.workingHours && payload.workingHours.satStart || '').trim(),
                satEnd: String(payload.workingHours && payload.workingHours.satEnd || '').trim(),
                sunStart: String(payload.workingHours && payload.workingHours.sunStart || '').trim(),
                sunEnd: String(payload.workingHours && payload.workingHours.sunEnd || '').trim(),
            },
""",
    """            workingHours: normalizeWorkingHours({
                monFriStart: payload.workingHours && payload.workingHours.monFriStart || '',
                monFriEnd: payload.workingHours && payload.workingHours.monFriEnd || '',
                satStart: payload.workingHours && payload.workingHours.satStart || '',
                satEnd: payload.workingHours && payload.workingHours.satEnd || '',
                sunStart: payload.workingHours && payload.workingHours.sunStart || '',
                sunEnd: payload.workingHours && payload.workingHours.sunEnd || '',
            }),
"""
)

path.write_text(text, encoding="utf-8")
print("server.js patched successfully")
