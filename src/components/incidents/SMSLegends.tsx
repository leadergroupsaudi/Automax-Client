import React, { useState, useEffect } from "react";
import { MapPin, MessageSquare, Paperclip } from "lucide-react";
import type { Incident } from "../../types";

interface SMSLegendsProps {
  incident: Incident;
}

export const SMSLegends: React.FC<SMSLegendsProps> = ({ incident }) => {
  const [snapshot, setSnapshot] = useState<{
    comments_count: number;
    attachments_count: number;
    has_location: boolean;
  } | null>(null);

  useEffect(() => {
    try {
      const snapshotsStr = localStorage.getItem("incident_view_snapshots");
      if (snapshotsStr) {
        const snapshots = JSON.parse(snapshotsStr);
        if (snapshots[incident.id]) {
          setSnapshot(snapshots[incident.id]);
        }
      }
    } catch (err) {
      console.error("Failed to load incident snapshot from localStorage", err);
    }
  }, [incident.id]);

  // Only show for incidents that sent out SMS to citizen requesting more info.
  // When an incident is created through IVR, source is 'ivr' and once citizen updates, it becomes 'sms-link'.
  const isSMSRequested =
    incident.source === "ivr" || incident.source === "sms-link";

  if (!isSMSRequested) return null;

  // Check if each item is present (added by citizen)
  // Location: present if coordinates are set or if source is sms-link (since form requires location)
  const hasLocation =
    !!(incident.latitude && incident.longitude) ||
    incident.source === "sms-link";

  // Comment: present if comments_count > 0 or if source is sms-link (since form requires comment)
  const hasComment =
    (incident.comments_count ?? 0) > 0 || incident.source === "sms-link";

  // Attachment: present if attachments_count > 0
  const hasAttachment = (incident.attachments_count ?? 0) > 0;

  // Check if there is new information received after the agent viewed the incident
  // Condition: we have a viewed snapshot, and current count/presence is greater than when viewed.
  const newLocation = snapshot ? hasLocation && !snapshot.has_location : false;
  const newComment = snapshot
    ? (incident.comments_count ?? 0) > snapshot.comments_count
    : false;
  const newAttachment = snapshot
    ? (incident.attachments_count ?? 0) > snapshot.attachments_count
    : false;

  return (
    <div
      className="inline-flex items-center gap-1.5 ml-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Location Icon */}
      <div
        className={`relative p-1 rounded-md border text-xs transition-all ${
          hasLocation
            ? "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50"
            : "text-gray-300 bg-gray-50 border-gray-100 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-700"
        }`}
        title={
          hasLocation
            ? "Location provided by citizen"
            : "No location provided yet"
        }
      >
        <MapPin className="w-3.5 h-3.5" />
        {newLocation && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </div>

      {/* Comment Icon */}
      <div
        className={`relative p-1 rounded-md border text-xs transition-all ${
          hasComment
            ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
            : "text-gray-300 bg-gray-50 border-gray-100 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-700"
        }`}
        title={
          hasComment ? "Comment provided by citizen" : "No comment provided yet"
        }
      >
        <MessageSquare className="w-3.5 h-3.5" />
        {newComment && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </div>

      {/* Attachment Icon */}
      <div
        className={`relative p-1 rounded-md border text-xs transition-all ${
          hasAttachment
            ? "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/50"
            : "text-gray-300 bg-gray-50 border-gray-100 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-700"
        }`}
        title={
          hasAttachment
            ? "Attachments uploaded by citizen"
            : "No attachments uploaded"
        }
      >
        <Paperclip className="w-3.5 h-3.5" />
        {newAttachment && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </div>
    </div>
  );
};
