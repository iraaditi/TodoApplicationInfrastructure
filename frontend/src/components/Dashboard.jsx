// frontend/src/components/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const Dashboard = ({ setIsLoggedIn, isPremium, setIsPremium }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await api.get('/tasks');
      setTasks(res.data);
    } catch (err) {
      console.error("Error fetching tasks", err);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    try {
      const res = await api.post('/tasks', { title: newTask });
      setTasks([...tasks, res.data]);
      setNewTask('');
    } catch (err) {
      console.error("Error adding task", err);
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      setTasks(tasks.filter(task => task._id !== id));
    } catch (err) {
      console.error("Error deleting task", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    navigate('/');
  };

  const handleBuyPremium = async () => {
    try {
      const { data: order } = await api.post('/premium/create-order');
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'Todo Cloud Pro',
        description: 'Upgrade to Premium Features',
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyRes = await api.post('/premium/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            alert(verifyRes.data.message);
            setIsPremium(true);
          } catch (err) {
            alert('Payment verification failed.');
          }
        },
        theme: { color: '#2563eb' }
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error('Payment initialization failed', err);
    }
  };

  // Drag and Drop Handler
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setTasks(items);
    // Note: In a production app, you would make an api.put() call here to save the new order to the database.
  };

  return (
    <div className="min-h-screen p-8">
      <header className="max-w-4xl mx-auto flex justify-between items-center bg-white p-6 rounded-lg shadow-md mb-8 border-t-4 border-blue-600">
        <div>
          <h1 className="text-3xl font-bold text-blue-800">My Tasks</h1>
          {isPremium ? (
            <span className="text-sm font-bold text-yellow-600 bg-yellow-100 px-2 py-1 rounded">👑 Premium Member</span>
          ) : (
            <span className="text-sm text-gray-500">Free Tier</span>
          )}
        </div>
        <div className="flex gap-4">
          {!isPremium && (
            <button onClick={handleBuyPremium} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded shadow transition">
              Upgrade (₹500)
            </button>
          )}
          <button onClick={handleLogout} className="border border-red-500 text-red-500 hover:bg-red-50 font-bold py-2 px-4 rounded transition">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <form onSubmit={handleAddTask} className="flex gap-4 mb-6">
          <input 
            type="text" value={newTask} onChange={(e) => setNewTask(e.target.value)} 
            placeholder="What needs to be done?" 
            className="flex-1 border border-blue-200 p-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition">
            Add Task
          </button>
        </form>

        {tasks.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No tasks yet. Add one above!</p>
        ) : (
          isPremium ? (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="tasks">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-3">
                    {tasks.map((task, index) => (
                      <Draggable key={task._id} draggableId={task._id} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="flex justify-between items-center p-4 bg-yellow-50 rounded border border-yellow-200 cursor-grab active:cursor-grabbing shadow-sm"
                          >
                            <span className="text-blue-900 font-medium">☰ {task.title}</span>
                            <button onClick={() => handleDeleteTask(task._id)} className="text-red-500 hover:bg-red-100 p-2 rounded transition">Delete</button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <div key={task._id} className="flex justify-between items-center p-4 bg-blue-50 rounded border border-blue-100">
                  <span className="text-blue-900 font-medium">{task.title}</span>
                  <button onClick={() => handleDeleteTask(task._id)} className="text-red-500 hover:bg-red-100 p-2 rounded transition">Delete</button>
                </div>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
};

export default Dashboard;