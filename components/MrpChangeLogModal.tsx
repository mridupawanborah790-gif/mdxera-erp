import React from 'react';
import Modal from './Modal';
import type { MrpChangeLogEntry } from '../types';

interface MrpChangeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: MrpChangeLogEntry[];
}

const MrpChangeLogModal: React.FC<MrpChangeLogModalProps> = ({ isOpen, onClose, logs }) => {
  const sortedLogs = [...logs].sort((a, b) =>
    new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="MRP Change Log" widthClass="max-w-6xl">
      <div className="p-3 bg-gray-50 border-b border-gray-300 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">MRP history by material code</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total Records: {sortedLogs.length}</p>
      </div>
      <div className="flex-1 overflow-auto bg-white">
        <table className="min-w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-[#e1e1e1] border-b border-gray-400 z-10 uppercase">
            <tr>
              <th className="p-2 border-r border-gray-400 text-left">Date & Time</th>
              <th className="p-2 border-r border-gray-400 text-left">Material Code</th>
              <th className="p-2 border-r border-gray-400 text-left">Product Name</th>
              <th className="p-2 border-r border-gray-400 text-right">Old MRP</th>
              <th className="p-2 border-r border-gray-400 text-right">New MRP</th>
              <th className="p-2 border-r border-gray-400 text-left">Changed By</th>
              <th className="p-2 text-left">Source Screen</th>
            </tr>
          </thead>
          <tbody>
            {sortedLogs.map((log) => (
              <tr key={log.id} className="border-b border-gray-200 hover:bg-yellow-50">
                <td className="p-2 border-r border-gray-200 font-semibold whitespace-nowrap">{new Date(log.changedAt).toLocaleString()}</td>
                <td className="p-2 border-r border-gray-200 font-mono font-bold">{log.materialCode}</td>
                <td className="p-2 border-r border-gray-200 font-bold uppercase">{log.productName}</td>
                <td className="p-2 border-r border-gray-200 text-right font-bold">₹{Number(log.oldMrp || 0).toFixed(2)}</td>
                <td className="p-2 border-r border-gray-200 text-right font-bold text-primary">₹{Number(log.newMrp || 0).toFixed(2)}</td>
                <td className="p-2 border-r border-gray-200 font-semibold">{log.changedByName || '-'}</td>
                <td className="p-2 font-semibold uppercase">{log.sourceScreen}</td>
              </tr>
            ))}
            {sortedLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-16 text-center text-gray-400 font-black uppercase tracking-[0.2em]">
                  No MRP change history available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

export default MrpChangeLogModal;
