import json
import logging
import os
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Team members in circular rotation order
TEAM_ROTATION = [
    "@babussr", "@koffir", "@andress", "@achandap", "@ashishmb", 
    "@garrjh", "@jshijj", "@jalioto", "@lvieiras", "@faracm", 
    "@mevelez", "@anaele", "@kurampil", "@aliving", "@vsharmro", 
    "@sasikmal", "@sshasan", "@gurusiva", "@vikrvenk"
]

# Configuration
SLACK_WEBHOOK_URL = os.environ.get('SLACK_WEBHOOK_URL', '')
SLACK_CHANNEL = os.environ.get('SLACK_CHANNEL', '#specreq-rotation')
# Epoch start date for rotation calculation (Sunday, August 17, 2025)
ROTATION_EPOCH = datetime(2025, 8, 17, tzinfo=timezone.utc)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    EventBridge triggered Lambda for weekly specreq queue rotation.
    Uses date calculation to determine current assignee (stateless).
    """
    try:
        logger.info("🔄 Starting specreq queue weekly rotation")
        
        # Calculate current and previous assignees based on date
        current_week_index = get_current_week_index()
        previous_week_index = get_previous_week_index()
        
        current_person = TEAM_ROTATION[current_week_index]
        previous_person = TEAM_ROTATION[previous_week_index] if previous_week_index != current_week_index else None
        
        # Send rotation notification
        send_rotation_notification(previous_person, current_person, current_week_index)
        
        result = {
            'statusCode': 200,
            'rotation_completed': True,
            'previous_assignee': previous_person,
            'current_assignee': current_person,
            'rotation_index': current_week_index,
            'total_team_members': len(TEAM_ROTATION),
            'week_number': get_weeks_since_epoch(),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(f"✅ Rotation: {previous_person} → {current_person} (index: {current_week_index})")
        return result
        
    except Exception as e:
        logger.error(f"❌ Rotation failed: {str(e)}", exc_info=True)
        send_error_alert(str(e))
        
        return {
            'statusCode': 500,
            'rotation_completed': False,
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }


def get_weeks_since_epoch() -> int:
    """Calculate number of weeks since rotation epoch."""
    now = datetime.now(timezone.utc)
    delta = now - ROTATION_EPOCH
    return int(delta.days // 7)


def get_current_week_index() -> int:
    """Get current week's assignee index using date calculation."""
    weeks_since_epoch = get_weeks_since_epoch()
    return weeks_since_epoch % len(TEAM_ROTATION)


def get_previous_week_index() -> int:
    """Get previous week's assignee index."""
    weeks_since_epoch = get_weeks_since_epoch()
    previous_week = weeks_since_epoch - 1
    return previous_week % len(TEAM_ROTATION) if previous_week >= 0 else (len(TEAM_ROTATION) - 1)


def send_rotation_notification(previous_person: Optional[str], current_person: str, index: int) -> None:
    """Send Slack notification via webhook."""
    try:
        if not SLACK_WEBHOOK_URL:
            logger.warning("⚠️ No SLACK_WEBHOOK_URL configured - printing message instead")
            now = datetime.now(timezone.utc)
            week_of = now.strftime('%m/%d')
            if previous_person and previous_person != current_person:
                message = f"Thank you {previous_person} for handling the specreq queue last week! This week ({week_of}), {current_person} will be taking care of the specreq queue."
            else:
                message = f"This week ({week_of}), {current_person} will be taking care of the specreq queue."
            print(f"📧 Slack message would be sent: {message}")
            return

        now = datetime.now(timezone.utc)
        week_of = now.strftime('%m/%d')
        
        # Build Slack message with rich formatting
        if previous_person and previous_person != current_person:
            message_text = f"🔄 *Specreq Queue Rotation Update*\n\nThank you {previous_person} for handling the specreq queue last week!\n\nThis week ({week_of}), {current_person} will be taking care of the specreq queue."
        else:
            message_text = f"🔄 *Specreq Queue Assignment*\n\nThis week ({week_of}), {current_person} will be taking care of the specreq queue."
        
        # Create Slack payload
        slack_payload = {
            "channel": SLACK_CHANNEL,
            "username": "Specreq Rotation Bot",
            "icon_emoji": ":arrows_counterclockwise:",
            "text": message_text,
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": message_text
                    }
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"Week {get_weeks_since_epoch() + 1} • Position {index + 1}/{len(TEAM_ROTATION)} in rotation"
                        }
                    ]
                }
            ]
        }
        
        # Send to Slack
        response = requests.post(
            SLACK_WEBHOOK_URL,
            json=slack_payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            logger.info(f"✅ Slack notification sent: {current_person}")
        else:
            logger.error(f"❌ Slack webhook failed with status: {response.status_code}")
            logger.error(f"Response: {response.text}")
            
    except Exception as e:
        logger.error(f"❌ Failed to send Slack notification: {e}")


def send_error_alert(error_msg: str) -> None:
    """Send Slack alert when rotation fails."""
    try:
        if not SLACK_WEBHOOK_URL:
            logger.warning("⚠️ No SLACK_WEBHOOK_URL configured for error alerts")
            print(f"📧 Slack error alert would be sent: 🚨 Specreq queue rotation failed: {error_msg}")
            return

        error_message = f"🚨 *Specreq Queue Rotation FAILED*\n\nError: {error_msg}\n\nPlease manually assign someone for this week."
        
        slack_payload = {
            "channel": SLACK_CHANNEL,
            "username": "Specreq Rotation Bot",
            "icon_emoji": ":warning:",
            "text": error_message,
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": error_message
                    }
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"Team: {', '.join(TEAM_ROTATION)}"
                        }
                    ]
                }
            ]
        }
        
        response = requests.post(
            SLACK_WEBHOOK_URL,
            json=slack_payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            logger.info("✅ Error alert sent to Slack")
        else:
            logger.error(f"❌ Slack error alert failed with status: {response.status_code}")
            
    except Exception as e:
        logger.error(f"❌ Failed to send Slack error alert: {e}")


def get_current_assignee() -> Dict[str, Any]:
    """Utility to get current assignee info based on date."""
    try:
        current_index = get_current_week_index()
        weeks_since_epoch = get_weeks_since_epoch()
        
        return {
            'assignee': TEAM_ROTATION[current_index],
            'index': current_index,
            'week_number': weeks_since_epoch + 1,
            'next_up': TEAM_ROTATION[(current_index + 1) % len(TEAM_ROTATION)],
            'calculated_at': datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        return {'error': str(e)}


def get_rotation_info() -> Dict[str, Any]:
    """Get complete rotation information."""
    try:
        current_index = get_current_week_index()
        previous_index = get_previous_week_index()
        weeks_since_epoch = get_weeks_since_epoch()
        
        return {
            'team_array': TEAM_ROTATION,
            'total_members': len(TEAM_ROTATION),
            'rotation_epoch': ROTATION_EPOCH.isoformat(),
            'weeks_since_epoch': weeks_since_epoch,
            'current_week': weeks_since_epoch + 1,
            'current_index': current_index,
            'current_assignee': TEAM_ROTATION[current_index],
            'previous_assignee': TEAM_ROTATION[previous_index],
            'next_assignee': TEAM_ROTATION[(current_index + 1) % len(TEAM_ROTATION)],
            'calculated_at': datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        return {'error': str(e)}


def preview_next_weeks(num_weeks: int = 4) -> Dict[str, Any]:
    """Preview upcoming weeks' assignments."""
    try:
        current_week = get_weeks_since_epoch()
        preview = []
        
        for i in range(num_weeks):
            week_num = current_week + i
            index = week_num % len(TEAM_ROTATION)
            week_start = ROTATION_EPOCH + timedelta(weeks=week_num)
            
            preview.append({
                'week_number': week_num + 1,
                'week_start': week_start.strftime('%Y-%m-%d'),
                'assignee': TEAM_ROTATION[index],
                'index': index
            })
        
        return {
            'upcoming_weeks': preview,
            'generated_at': datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        return {'error': str(e)}


# Test function
if __name__ == "__main__":
    print("🧪 Testing specreq rotation logic...")
    
    # Test current assignee
    current = get_current_assignee()
    print(f"Current assignee: {json.dumps(current, indent=2)}")
    
    # Test rotation info
    info = get_rotation_info()
    print(f"Rotation info: {json.dumps(info, indent=2)}")
    
    # Test preview
    preview = preview_next_weeks(4)
    print(f"Next 4 weeks: {json.dumps(preview, indent=2)}")
    
    # Test Slack message format (without actually sending)
    current_index = get_current_week_index()
    previous_index = get_previous_week_index()
    current_person = TEAM_ROTATION[current_index]
    previous_person = TEAM_ROTATION[previous_index] if previous_index != current_index else None
    
    now = datetime.now(timezone.utc)
    week_of = now.strftime('%m/%d')
    
    if previous_person and previous_person != current_person:
        test_message = f"🔄 *Specreq Queue Rotation Update*\n\nThank you {previous_person} for handling the specreq queue last week!\n\nThis week ({week_of}), {current_person} will be taking care of the specreq queue."
    else:
        test_message = f"🔄 *Specreq Queue Assignment*\n\nThis week ({week_of}), {current_person} will be taking care of the specreq queue."
    
    print(f"\nSlack message preview:")
    print(f"Channel: {SLACK_CHANNEL}")
    print(f"Message: {test_message}")
    print(f"Context: Week {get_weeks_since_epoch() + 1} • Position {current_index + 1}/{len(TEAM_ROTATION)} in rotation")
    
    print("\n✅ Test completed (no actual Slack message sent)")