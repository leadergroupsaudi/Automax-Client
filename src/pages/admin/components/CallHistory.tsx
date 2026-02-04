
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';

export const CallHistory: React.FC = () => {
    const { t } = useTranslation();

    const dummyCalls = [
        {
            id: '1',
            name: 'John Doe',
            number: '+1 (555) 123-4567',
            type: 'incoming',
            status: 'missed',
            duration: '0:00',
            timestamp: 'Today, 10:30 AM'
        },
        {
            id: '2',
            name: 'Sarah Smith',
            number: '+1 (555) 987-6543',
            type: 'outgoing',
            status: 'attended',
            duration: '5:23',
            timestamp: 'Today, 09:15 AM'
        },
        {
            id: '3',
            name: 'Michael Brown',
            number: '+1 (555) 456-7890',
            type: 'incoming',
            status: 'declined',
            duration: '0:00',
            timestamp: 'Yesterday, 4:45 PM'
        },
        {
            id: '4',
            name: 'Tech Support',
            number: '+1 (800) 123-0000',
            type: 'incoming',
            status: 'attended',
            duration: '12:45',
            timestamp: 'Yesterday, 2:30 PM'
        },
        {
            id: '5',
            name: 'Alice Johnson',
            number: '+1 (555) 222-3333',
            type: 'outgoing',
            status: 'missed',
            duration: '0:00',
            timestamp: 'Mon, 11:20 AM'
        }
    ];

    const getStatusIcon = (status: string, type: string) => {
        if (type === 'outgoing') {
            return <Phone className="w-4 h-4 text-slate-400 rotate-90" />; // Or specific outgoing icon
        }
        switch (status) {
            case 'missed':
                return <Phone className="w-4 h-4 text-red-500" />; // Or X icon
            case 'declined':
                return <Phone className="w-4 h-4 text-slate-400" />; // Or specific icon
            case 'attended':
            default:
                return <Phone className="w-4 h-4 text-green-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'missed': return 'text-red-500';
            case 'declined': return 'text-slate-500';
            case 'attended': return 'text-green-500';
            default: return 'text-slate-900';
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">{t('callCentre.callHistory', 'Call History')}</h1>
                <p className="text-slate-500 mt-1">{t('callCentre.historySubtitle', 'View your recent calls')}</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">{t('callCentre.recentCalls', 'Recent Calls')}</h2>
                </div>
                <div className="divide-y divide-slate-100">
                    {dummyCalls.map((call) => (
                        <div key={call.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${call.status === 'missed' ? 'bg-red-50' : 'bg-slate-100'}`}>
                                    {getStatusIcon(call.status, call.type)}
                                </div>
                                <div>
                                    <h3 className={`font-medium ${getStatusColor(call.status)}`}>
                                        {call.name}
                                    </h3>
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                        <span>{call.number}</span>
                                        <span>•</span>
                                        <span>{call.type === 'incoming' ? 'Incoming' : 'Outgoing'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-medium text-slate-900">{call.timestamp}</p>
                                <p className="text-sm text-slate-500">
                                    {call.duration !== '0:00' ? call.duration : call.status}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
